import type { Runtime } from '../grc/router';
import type { Actor } from './common';
export type LiveSource = {
    id: string;
    ref: string;
    module: string;
    title: string;
    data: Record<string, unknown>;
};
export async function liveContext(env: Runtime, actor: Actor, question: string, lang: 'tr' | 'en') {
 const {runAgent}=await import('./tool-registry');const r=await runAgent(env,actor,question,{},lang);return {...r,sources:r.sources||[]};
}
