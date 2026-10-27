import { handler } from '../server/ai/vercel.ts';

/** GET /api/ai-metrics: today's calls, tokens, spend, cache hits and latency for the operator (bearer BE_ADMIN_TOKEN); 404 without it. */
export const config = { runtime: 'nodejs', maxDuration: 10 };
export default handler('ai-metrics');
