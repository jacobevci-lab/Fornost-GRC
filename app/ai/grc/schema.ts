import { completedInitialization } from '../../completed-initialization';
export const grcAiSchema = [
 `CREATE TABLE IF NOT EXISTS grc_ai_config(id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL,secret TEXT,revision TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS grc_ai_results(id TEXT PRIMARY KEY,kind TEXT NOT NULL,subject TEXT NOT NULL,source_hash TEXT NOT NULL,result TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS grc_ai_results_subject ON grc_ai_results(kind,subject,created_at)`,
 `CREATE TABLE IF NOT EXISTS grc_ai_questionnaires(id TEXT PRIMARY KEY,title TEXT NOT NULL,answers TEXT NOT NULL,revision TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS grc_ai_conversions(id TEXT PRIMARY KEY,result_id TEXT NOT NULL,item INTEGER NOT NULL,target TEXT NOT NULL,record_id TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(result_id,item,target))`,
];
const initialize=completedInitialization();
export async function ensureGrcAi(db:D1Database){await initialize(db,async()=>{for(const sql of grcAiSchema)await db.prepare(sql).run();});}
