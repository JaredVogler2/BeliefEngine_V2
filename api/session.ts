import { handler } from '../server/ai/vercel.ts';

/** POST /api/session: an anonymous, short-lived capability token for the inference routes (after consent, origin and rate checks). */
export const config = { runtime: 'nodejs', maxDuration: 10 };
export default handler('session');
