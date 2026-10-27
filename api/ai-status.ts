import { handler } from '../server/ai/vercel.ts';

/** GET /api/ai-status: whether online interpretation is available here, with no secret and no per-user data. */
export const config = { runtime: 'nodejs', maxDuration: 10 };
export default handler('ai-status');
