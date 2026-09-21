export type AssuranceEscalationSeverity="medium"|"high"|"critical";
export type AssuranceEscalationSignal={fingerprint:string;kind:string;severity:AssuranceEscalationSeverity;subjectRef:string;owner:string;title:string;detail:string;source:Record<string,unknown>};
export type AssuranceEscalationDbRow={id:string;fingerprint:string;kind:string;severity:string;subject_ref:string;owner:string;title:string;detail:string;status:string;first_seen_at:string;last_seen_at:string;acknowledged_by:string|null;acknowledged_at:string|null;ack_note:string|null;resolved_by:string|null;resolved_at:string|null;source_json:string};

export const assuranceEscalationSchema=[
 `CREATE TABLE IF NOT EXISTS continuous_assurance_escalations(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,severity TEXT NOT NULL,subject_ref TEXT NOT NULL,owner TEXT NOT NULL DEFAULT '',title TEXT NOT NULL,detail TEXT NOT NULL,status TEXT NOT NULL,first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,acknowledged_by TEXT,acknowledged_at TEXT,ack_note TEXT,resolved_by TEXT,resolved_at TEXT,source_json TEXT NOT NULL DEFAULT '{}')`,
 `CREATE INDEX IF NOT EXISTS ca_escalations_status_idx ON continuous_assurance_escalations(status,severity,last_seen_at)`,
 `CREATE INDEX IF NOT EXISTS ca_escalations_subject_idx ON continuous_assurance_escalations(subject_ref,kind,status)`,
];

export async function ensureAssuranceEscalationSchema(db:D1Database){for(const sql of assuranceEscalationSchema)await db.prepare(sql).run()}

async function upsertSignal(db:D1Database,signal:AssuranceEscalationSignal,stamp:string){
 const id=`CAE-${crypto.randomUUID()}`;
 await db.prepare(`INSERT INTO continuous_assurance_escalations(id,fingerprint,kind,severity,subject_ref,owner,title,detail,status,first_seen_at,last_seen_at,source_json) VALUES(?,?,?,?,?,?,?,?,'active',?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET kind=excluded.kind,severity=excluded.severity,subject_ref=excluded.subject_ref,owner=excluded.owner,title=excluded.title,detail=excluded.detail,last_seen_at=excluded.last_seen_at,source_json=excluded.source_json,status=CASE WHEN continuous_assurance_escalations.status='resolved' THEN 'active' ELSE continuous_assurance_escalations.status END,acknowledged_by=CASE WHEN continuous_assurance_escalations.status='resolved' THEN NULL ELSE continuous_assurance_escalations.acknowledged_by END,acknowledged_at=CASE WHEN continuous_assurance_escalations.status='resolved' THEN NULL ELSE continuous_assurance_escalations.acknowledged_at END,ack_note=CASE WHEN continuous_assurance_escalations.status='resolved' THEN NULL ELSE continuous_assurance_escalations.ack_note END,resolved_by=CASE WHEN continuous_assurance_escalations.status='resolved' THEN NULL ELSE continuous_assurance_escalations.resolved_by END,resolved_at=CASE WHEN continuous_assurance_escalations.status='resolved' THEN NULL ELSE continuous_assurance_escalations.resolved_at END`).bind(id,signal.fingerprint,signal.kind,signal.severity,signal.subjectRef,signal.owner,signal.title,signal.detail,stamp,stamp,JSON.stringify(signal.source)).run();
}

export async function syncAssuranceEscalationSignals(db:D1Database,signals:AssuranceEscalationSignal[],managedKinds:Iterable<string>,now=new Date(),resolvedBy="system:condition-cleared"){
 await ensureAssuranceEscalationSchema(db);const stamp=now.toISOString(),active=new Set(signals.map(signal=>signal.fingerprint)),kinds=new Set(managedKinds);for(const signal of signals)await upsertSignal(db,signal,stamp);
 const existing=(await db.prepare("SELECT id,fingerprint,kind,status FROM continuous_assurance_escalations WHERE status IN ('active','acknowledged') LIMIT 5000").all<{id:string;fingerprint:string;kind:string;status:string}>()).results||[];let resolved=0;
 for(const row of existing){if(!kinds.has(row.kind)||active.has(row.fingerprint))continue;await db.prepare("UPDATE continuous_assurance_escalations SET status='resolved',resolved_by=?,resolved_at=?,last_seen_at=? WHERE id=? AND status IN ('active','acknowledged')").bind(resolvedBy,stamp,stamp,row.id).run();resolved++}
 return{active:signals.length,resolved};
}

export async function readAssuranceEscalationRows(db:D1Database,limit=3000){await ensureAssuranceEscalationSchema(db);return (await db.prepare("SELECT * FROM continuous_assurance_escalations ORDER BY last_seen_at DESC LIMIT ?").bind(limit).all<AssuranceEscalationDbRow>()).results||[]}
