import { parseModuleAccess, type ModuleAccess } from "../../module-access";

export async function ensureModuleAccessSchema(db: D1Database) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS user_module_access (user_id TEXT PRIMARY KEY, policy_json TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS user_access_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, actor TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, created_at TEXT NOT NULL)"),
  ]);
}
export async function readModuleAccess(db: D1Database, userId: string): Promise<ModuleAccess> {
  const row = await db.prepare("SELECT policy_json FROM user_module_access WHERE user_id=?").bind(userId).first<{ policy_json: string }>();
  return parseModuleAccess(row?.policy_json);
}
