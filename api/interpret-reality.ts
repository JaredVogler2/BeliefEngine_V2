import { handler } from '../server/ai/vercel.ts';

/** POST /api/interpret-reality: one belief sentence → checked readings in the reality language (AST v2), under the same limits. */
export const config = { runtime: 'nodejs', maxDuration: 30 };
export default handler('interpret-reality');
