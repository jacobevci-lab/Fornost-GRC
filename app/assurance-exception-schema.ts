export const exceptionTableSql = `CREATE TABLE IF NOT EXISTS continuous_assurance_exceptions(id TEXT PRIMARY KEY,finding_id TEXT NOT NULL DEFAULT '',rule_id TEXT NOT NULL DEFAULT '',control_ref TEXT NOT NULL DEFAULT '',risk_ref TEXT NOT NULL DEFAULT '',reason TEXT NOT NULL,expires_at TEXT NOT NULL,evidence_reference TEXT NOT NULL,evidence_sha256 TEXT NOT NULL,status TEXT NOT NULL,submitted_by TEXT NOT NULL,submitted_at TEXT NOT NULL,reviewed_by TEXT,reviewed_at TEXT,review_note TEXT,revoked_by TEXT,revoked_at TEXT,retest_required INTEGER NOT NULL DEFAULT 0,retest_work_item_id TEXT,lifecycle_updated_at TEXT,lifecycle_token TEXT NOT NULL DEFAULT '',retest_completed_at TEXT,retest_result_ref TEXT)`;
const columns:Record<string,string>={retest_required:"INTEGER NOT NULL DEFAULT 0",retest_work_item_id:"TEXT",lifecycle_updated_at:"TEXT",lifecycle_token:"TEXT NOT NULL DEFAULT ''",retest_completed_at:"TEXT",retest_result_ref:"TEXT"};
export async function ensureAssuranceExceptionSchema(db:D1Database){
 await db.prepare(exceptionTableSql).run();
 const info=await db.prepare('PRAGMA table_info(continuous_assurance_exceptions)').all<{name:string}>();
 for(const [name,type] of Object.entries(columns)){
  if(info.results.some(row=>row.name===name))continue;
  try{await db.prepare(`ALTER TABLE continuous_assurance_exceptions ADD COLUMN ${name} ${type}`).run();}
  catch(error){const current=await db.prepare('PRAGMA table_info(continuous_assurance_exceptions)').all<{name:string}>();if(!current.results.some(row=>row.name===name))throw error;}
 }
 await db.prepare('CREATE INDEX IF NOT EXISTS ca_exceptions_retest_idx ON continuous_assurance_exceptions(retest_work_item_id,status,retest_required)').run();
 await db.prepare('CREATE INDEX IF NOT EXISTS ca_exceptions_status_expiry_idx ON continuous_assurance_exceptions(status,expires_at)').run();
}
