/**
 * A local stand-in for the Upstash REST interface, backed by a REAL Redis server: it accepts `POST /` with a JSON array command and
 * `Authorization: Bearer <token>`, runs the command on Redis over its wire protocol, and answers `{result}` or `{error}`.
 *
 * It exists so the quota store's Lua scripts are executed by Redis itself in tests and in the local simulator, not by a fake.
 * It is a test and development aid: never deployed, no TLS, bound to 127.0.0.1.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';

class RespError {
  constructor(readonly message: string) {}
}

type Parsed = { value: unknown; end: number } | null;

function parse(buf: Buffer, i: number): Parsed {
  if (i >= buf.length) return null;
  const nl = buf.indexOf('\r\n', i);
  if (nl < 0) return null;
  const type = String.fromCharCode(buf[i]);
  const line = buf.toString('utf8', i + 1, nl);
  switch (type) {
    case '+':
      return { value: line, end: nl + 2 };
    case '-':
      return { value: new RespError(line), end: nl + 2 };
    case ':':
      return { value: Number(line), end: nl + 2 };
    case '$': {
      const n = Number(line);
      if (n < 0) return { value: null, end: nl + 2 };
      if (buf.length < nl + 2 + n + 2) return null;
      return { value: buf.toString('utf8', nl + 2, nl + 2 + n), end: nl + 2 + n + 2 };
    }
    case '*': {
      const n = Number(line);
      if (n < 0) return { value: null, end: nl + 2 };
      const arr: unknown[] = [];
      let p = nl + 2;
      for (let k = 0; k < n; k++) {
        const r = parse(buf, p);
        if (!r) return null;
        arr.push(r.value);
        p = r.end;
      }
      return { value: arr, end: p };
    }
    default:
      throw new Error(`unexpected RESP type ${type}`);
  }
}

/** A minimal pipelined RESP client: commands are answered in order. */
export class RespClient {
  private buf = Buffer.alloc(0);
  private readonly queue: { resolve: (v: unknown) => void; reject: (e: Error) => void }[] = [];

  private constructor(private readonly sock: Socket) {
    sock.on('data', (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      for (;;) {
        if (!this.queue.length) break;
        const r = parse(this.buf, 0);
        if (!r) break;
        this.buf = this.buf.subarray(r.end);
        this.queue.shift()!.resolve(r.value);
      }
    });
    sock.on('error', (e) => this.queue.splice(0).forEach((q) => q.reject(e)));
    sock.on('close', () => this.queue.splice(0).forEach((q) => q.reject(new Error('connection closed'))));
  }

  static open(port: number, host = '127.0.0.1'): Promise<RespClient> {
    return new Promise((resolve, reject) => {
      const s = connect(port, host, () => resolve(new RespClient(s)));
      s.once('error', reject);
    });
  }

  send(args: string[]): Promise<unknown> {
    const parts = [`*${args.length}\r\n`, ...args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`)];
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.sock.write(parts.join(''));
    });
  }

  close(): void {
    this.sock.destroy();
  }
}

export interface Shim {
  url: string;
  token: string;
  /** simulate an outage: every request answers 503 */
  setDown(down: boolean): void;
  /** add latency to every request */
  setDelay(ms: number): void;
  redis: RespClient;
  stop(): Promise<void>;
}

export async function startShim(redisPort: number, token = 'test-store-token-0123456789abcdef'): Promise<Shim> {
  const redis = await RespClient.open(redisPort);
  let down = false;
  let delay = 0;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', async () => {
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (down) return reply(503, { error: 'service unavailable' });
      if (req.method !== 'POST') return reply(405, { error: 'POST only' });
      if (req.headers.authorization !== `Bearer ${token}`) return reply(401, { error: 'Unauthorized' });
      let cmd: unknown;
      try {
        cmd = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return reply(400, { error: 'ERR invalid json' });
      }
      if (!Array.isArray(cmd) || !cmd.length || cmd.some((a) => typeof a !== 'string')) return reply(400, { error: 'ERR command must be an array of strings' });
      try {
        const r = await redis.send(cmd as string[]);
        if (r instanceof RespError) return reply(400, { error: r.message });
        return reply(200, { result: r });
      } catch (e) {
        return reply(500, { error: String((e as Error).message) });
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    setDown: (d) => (down = d),
    setDelay: (ms) => (delay = ms),
    redis,
    stop: () =>
      new Promise((r) => {
        redis.close();
        server.close(() => r());
      }),
  };
}

/** Starts a throw-away redis-server on a free port (no persistence). Null when the binary is not installed. */
export async function startRedisServer(): Promise<{ port: number; proc: ChildProcess; stop: () => void } | null> {
  const port = 20000 + Math.floor(Math.random() * 20000);
  let proc: ChildProcess;
  try {
    proc = spawn('redis-server', ['--port', String(port), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
  const ok = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    proc.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    proc.stdout?.on('data', (d: Buffer) => {
      if (/ready to accept connections/i.test(d.toString())) {
        clearTimeout(timer);
        resolve(true);
      }
    });
  });
  if (!ok) {
    proc.kill('SIGKILL');
    return null;
  }
  return { port, proc, stop: () => proc.kill('SIGKILL') };
}

if (process.argv[1]?.endsWith('redis-rest-shim.ts')) {
  // local development: `npx tsx scripts/lib/redis-rest-shim.ts [redisPort]` exposes a running Redis as an Upstash-style REST URL
  const redisPort = Number(process.argv[2] ?? 6379);
  const shim = await startShim(redisPort, process.env.UPSTASH_REDIS_REST_TOKEN ?? 'dev-store-token-0123456789abcdef');
  console.log(`Upstash-style REST shim for redis://127.0.0.1:${redisPort} on ${shim.url} (token from UPSTASH_REDIS_REST_TOKEN or the dev default)`);
}
