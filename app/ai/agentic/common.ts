import type { Actor } from '../../api/auth/security';
import { isScoped } from '../../module-access';
import { checkAiAccess } from '../operating-policy';
import { ensureFindingsSchemaCompatibility } from '../../api/findings/schema-compat';
import { ensureCoreGrcSchemaCompatibility } from '../../api/grc/schema-compat';
import { ensureGrcAi } from '../grc/schema';
import { ensureAgentic } from './schema';
export type { Actor };
export class AgenticError extends Error {
    constructor(public code: string, public status = 422) { super(code); }
}
export const text = (v: unknown, n = 2000) => String(v ?? '').trim().replace(/\0/g, '').slice(0, n);
export const normal = (v: string) => v.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
export async function ready(db: D1Database) { await ensureCoreGrcSchemaCompatibility(db); await ensureFindingsSchemaCompatibility(db); await ensureAgentic(db); await ensureGrcAi(db); }
export function fullAccess(actor: Actor, write = false) { if (actor.orgScope?.restricted || isScoped(actor) || write && !['Admin', 'Editor'].includes(actor.role))
    throw new AgenticError('AI_SCOPE', 403); }
export async function allowed(db: D1Database, actor: Actor, operation: 'chat' | 'agents' | 'drafts') { fullAccess(actor, operation !== 'chat'); if (!(await checkAiAccess(db, actor.role, operation)).allowed)
    throw new AgenticError('AI_OPERATION_BLOCKED', 403); }
export type Pin = {
    table: string;
    row: Record<string, unknown>;
};
const tables = ['simple_grc_records', 'local_users', 'enterprise_findings', 'regulatory_changes', 'policy_documents', 'policy_versions', 'ai_model_inventory', 'ai_system_profiles', 'ai_governance_extensions','enterprise_incidents','risk_appetite_statements'];
export function pinGuard(pins: Pin[]) {
    const groups = new Map<string, {
        table: string;
        keys: string[];
        rows: Record<string, unknown>[];
    }>();
    for (const pin of pins) {
        const keys = Object.keys(pin.row).sort();
        if (!tables.includes(pin.table) || !keys.length || keys.some(k => !/^[a-z_][a-z0-9_]*$/.test(k)))
            throw new AgenticError('AI_SOURCE');
        const key = pin.table + ':' + keys.join(',');
        const group = groups.get(key) || { table: pin.table, keys, rows: [] };
        group.rows.push(pin.row);
        groups.set(key, group);
    }
    const values: string[] = [];
    const sql = [...groups.values()].map(g => { values.push(JSON.stringify(g.rows)); return `NOT EXISTS(SELECT 1 FROM json_each(?) pin WHERE NOT EXISTS(SELECT 1 FROM ${g.table} source WHERE ${g.keys.map(k => `source.${k} IS json_extract(pin.value,'$.${k}')`).join(' AND ')}))`; }).join(' AND ') || '1';
    return { sql, values };
}
export async function person(db: D1Database, email: unknown) { const row = await db.prepare("SELECT id,name,email,status FROM local_users WHERE lower(email)=lower(?) AND status='Active'").bind(text(email, 254)).first<{
    id: string;
    name: string;
    email: string;
    status: string;
}>(); if (!row)
    throw new AgenticError('AI_PEOPLE'); return row; }
export const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
