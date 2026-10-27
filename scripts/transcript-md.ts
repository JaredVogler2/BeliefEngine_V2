/**
 * Turn a `claude -p --output-format stream-json --verbose` session into a readable transcript: the agent's own words, each tool call,
 * and the start of each result (the belief tools get more room). Nothing is edited or summarised by hand.
 *
 *   npx tsx scripts/transcript-md.ts session.jsonl > transcript-body.md
 */
import { readFileSync } from 'node:fs';

interface Block { type: string; id?: string; name?: string; input?: unknown; text?: string; tool_use_id?: string; content?: string | { text?: string }[] }
const file = process.argv[2];
if (!file) {
  console.error('usage: npx tsx scripts/transcript-md.ts <session.jsonl>');
  process.exit(2);
}
const uses = new Map<string, { n: number; name: string }>();
let n = 0;
const out: string[] = [];
const clip = (s: string, k: number) => (s.length > k ? `${s.slice(0, k)}…` : s).replace(/\n+/g, ' ');
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let e: { type?: string; message?: { content?: Block[] | string } };
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  const content = e.message?.content;
  if (!Array.isArray(content)) continue;
  for (const c of content) {
    if (e.type === 'assistant' && c.type === 'text' && c.text?.trim()) out.push(`> ${c.text.trim().replace(/\n/g, '\n> ')}\n`);
    else if (e.type === 'assistant' && c.type === 'tool_use' && c.id) {
      n++;
      uses.set(c.id, { n, name: c.name ?? '' });
      out.push(`**${n}. \`${(c.name ?? '').replace('mcp__belief-engine__', '')}\`** \`${clip(JSON.stringify(c.input), 220)}\``);
    } else if (e.type === 'user' && c.type === 'tool_result' && c.tool_use_id && uses.has(c.tool_use_id)) {
      const u = uses.get(c.tool_use_id)!;
      const text = typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x.text ?? '').join(' ');
      const wide = /submit_belief|confirm_belief/.test(u.name) || /^(STALE|TOKEN|READ_ONLY|CAPABILITY)/.test(text);
      out.push(`   → ${clip(text, wide ? 900 : 200)}\n`);
    }
  }
}
console.log(out.join('\n'));
