import { handler } from '../server/ai/vercel.ts';

/** POST /api/npc-decision: proposed moves and lines for up to six villagers, each checked against what they know and may do. */
export const config = { runtime: 'nodejs', maxDuration: 30 };
export default handler('npc-decision');
