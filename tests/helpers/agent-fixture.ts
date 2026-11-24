import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {ready,type Actor} from '../../app/ai/agentic/common';
import {blankProfile} from '../../app/ai/governance-domain';
export const actor:Actor={id:'admin',email:'admin@example.test',name:'admin',source:'local',role:'Admin'};
export async function fixture() {
    const sql = new DatabaseSync(':memory:');
    for (const file of readdirSync('drizzle').filter(x => x.endsWith('.sql')).sort())
        sql.exec(readFileSync('drizzle/' + file, 'utf8'));
    function prepare(query: string, values: SQLInputValue[] = []) { return { bind: (...args: SQLInputValue[]) => prepare(query, args), all: async () => ({ results: sql.prepare(query).all(...values) }), first: async () => sql.prepare(query).get(...values) || null, run: async () => execute(), execute }; function execute() { if (/^\s*(SELECT|WITH)/i.test(query))
        return { results: sql.prepare(query).all(...values), meta: { changes: 0 } }; return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; } }
    const db = { prepare, batch: async (statements: ReturnType<typeof prepare>[]) => { sql.exec('BEGIN'); try {
            const results = statements.map(s => s.execute());
            sql.exec('COMMIT');
            return results;
        }
        catch (e) {
            sql.exec('ROLLBACK');
            throw e;
        } } } as unknown as D1Database;
    await ready(db);
    const env = { DB: db };
    function seed(table: string, values: Record<string, SQLInputValue>) { const all: Record<string, SQLInputValue> = {}; for (const c of sql.prepare(`PRAGMA table_info(${table})`).all())
        if (c.notnull && c.dflt_value === null)
            all[String(c.name)] = c.type === 'INTEGER' ? 1 : 'fixture'; Object.assign(all, values); sql.prepare(`INSERT INTO ${table}(${Object.keys(all)}) VALUES(${Object.keys(all).map(() => '?')})`).run(...Object.values(all)); }
    for (const id of ['admin', 'owner', 'reviewer'])
        seed('local_users', { id, name: id, email: id + '@example.test', role: id === 'owner' ? 'Editor' : 'Admin', status: 'Active' });
    function record(id: string, module: string, data: object) { seed('simple_grc_records', { id, module, data_json: JSON.stringify(data), created_at: '2026-11-24T00:00:00Z', updated_at: '2026-11-24T00:00:00Z' }); }
    record('asset', 'Varlık Envanteri', { title: 'Entra ID', owner: 'admin', status: 'Aktif' });
    seed('simple_grc_record_codes', { record_id: 'asset', module: 'Varlık Envanteri', code: 'AST-001', created_at: '2026-11-24' });
    function model() { seed('ai_model_inventory', { id: 'model', system_name: 'Customer assistant', model_name: 'Local model', owner: actor.email, status: 'draft', updated_at: '2026-11-24T00:00:00Z' }); seed('ai_system_profiles', { model_id: 'model', profile_json: JSON.stringify({ ...blankProfile, name: 'Customer assistant', model: 'Local model', risk: 'minimal', owner: actor.email, technical: 'owner@example.test', reviewer: 'reviewer@example.test' }), phase: 'draft', updated_at: '2026-11-24T00:00:00Z' }); }
    return { sql, db, env, seed, record, model };
}
