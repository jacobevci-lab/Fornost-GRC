import {completedInitialization} from '../completed-initialization';
const once=completedInitialization();
export const enterpriseSchema=`CREATE TABLE IF NOT EXISTS org_entities (
 id TEXT PRIMARY KEY NOT NULL, parent_id TEXT REFERENCES org_entities(id), kind TEXT NOT NULL CHECK(kind IN ('holding','company','subsidiary','unit')),
 name TEXT NOT NULL, UNIQUE(parent_id,name));
INSERT OR IGNORE INTO org_entities(id,parent_id,kind,name) VALUES('root',NULL,'holding','Holding');
CREATE TABLE IF NOT EXISTS org_user_roles (
 user_id TEXT PRIMARY KEY NOT NULL, role TEXT NOT NULL CHECK(role IN ('group-admin','group-ciso','entity-manager','contributor')), revision TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS org_memberships (
 user_id TEXT NOT NULL REFERENCES org_user_roles(user_id), org_entity_id TEXT NOT NULL REFERENCES org_entities(id), PRIMARY KEY(user_id,org_entity_id));
CREATE TABLE IF NOT EXISTS org_record_entities (
 kind TEXT NOT NULL, record_id TEXT NOT NULL, org_entity_id TEXT NOT NULL REFERENCES org_entities(id), note TEXT NOT NULL DEFAULT '',
 revision TEXT NOT NULL, PRIMARY KEY(kind,record_id));
CREATE INDEX IF NOT EXISTS org_record_entities_scope ON org_record_entities(org_entity_id,kind);
CREATE TABLE IF NOT EXISTS org_directory_config (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL, revision TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS org_scim_tokens (id INTEGER PRIMARY KEY CHECK(id=1), digest TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS org_access_events (id TEXT PRIMARY KEY NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, subject TEXT NOT NULL, stamp TEXT NOT NULL);`;
export async function ensureEnterprise(db:D1Database){
  await once(db,()=>db.batch(enterpriseSchema.split(';').map(s=>s.trim()).filter(Boolean).map(sql=>db.prepare(sql))));
}
