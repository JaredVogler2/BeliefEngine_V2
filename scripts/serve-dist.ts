/**
 * A tiny static server for dist/ that applies vercel.json's `headers` and `rewrites` the way Vercel would, so the production headers (CSP above all)
 * can be exercised in a real browser before anything is deployed. It is a verification aid, not a production server.
 */
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

interface Rule {
  source: string;
  headers?: { key: string; value: string }[];
  destination?: string;
}
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

/** Vercel path patterns are path-to-regexp; the few we use are `(.*)` wildcards, plain paths and one negative lookahead. */
function toRegex(source: string): RegExp {
  return new RegExp('^' + source.replace(/\(\.\*\)/g, '.*') + '$');
}

export function serveDist(port: number, root = 'dist', config = 'vercel.json'): Promise<Server> {
  const cfg = JSON.parse(readFileSync(config, 'utf8')) as { headers?: Rule[]; rewrites?: Rule[] };
  const header = (cfg.headers ?? []).map((r) => ({ re: toRegex(r.source), headers: r.headers ?? [] }));
  const rewrite = (cfg.rewrites ?? []).map((r) => ({ re: toRegex(r.source), to: r.destination ?? '/index.html' }));
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.includes('..')) {
      res.writeHead(400).end('bad path');
      return;
    }
    let file = join(root, normalize(path));
    if (!existsSync(file) || statSync(file).isDirectory()) {
      const rw = rewrite.find((r) => r.re.test(path));
      if (rw) {
        path = rw.to;
        file = join(root, rw.to);
      }
    }
    const applied: Record<string, string> = {};
    for (const h of header) if (h.re.test(url.pathname === '/index.html' ? '/' : url.pathname)) for (const { key, value } of h.headers) applied[key] = value;
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...applied }).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...applied }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1]?.endsWith('serve-dist.ts')) {
  const port = Number(process.argv[2] ?? 4174);
  await serveDist(port);
  console.log(`serving dist/ with vercel.json headers on http://127.0.0.1:${port}`);
}
