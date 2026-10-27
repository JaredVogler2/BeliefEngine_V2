import { handler } from '../server/ai/vercel.ts';

/** POST /api/interpret-belief: one belief sentence → schema-checked readings, under session, quota and spend limits. */
export const config = { runtime: 'nodejs', maxDuration: 30 };
export default handler('interpret-belief');
