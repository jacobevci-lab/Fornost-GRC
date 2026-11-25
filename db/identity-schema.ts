import { sql } from "drizzle-orm";
import { check, primaryKey, unique, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Canonical schema for Fornost local identity data.
 *
 * Runtime table creation in app/api/auth/security.ts remains as a temporary
 * backward-compatibility/self-heal path for older on-prem installations. New
 * deployments and managed D1 environments should receive these tables through
 * the migration chain.
 */
export const localUsers = sqliteTable("local_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull().default(100_000),
  role: text("role").notNull(),
  status: text("status").notNull().default("Active"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const localSessions = sqliteTable("local_sessions", {
  idHash: text("id_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [
  index("local_sessions_expiry_idx").on(table.expiresAt, table.idHash),
  index("local_sessions_user_idx").on(table.userId),
]);

export const userModuleAccess = sqliteTable("user_module_access", {
  userId: text("user_id").primaryKey(), policyJson: text("policy_json").notNull(),
  updatedAt: text("updated_at").notNull(), updatedBy: text("updated_by").notNull(),
});
export const userAccessEvents = sqliteTable("user_access_events", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), actor: text("actor").notNull(),
  beforeJson: text("before_json").notNull(), afterJson: text("after_json").notNull(), createdAt: text("created_at").notNull(),
});

export const userAppearance = sqliteTable("user_appearance", {
  userId: text("user_id").primaryKey(),
  palette: text("palette").notNull().default("default"),
});


export const identityLoginConfig = sqliteTable("identity_login_config", {
  id: integer("id").primaryKey(), configJson: text("config_json").notNull(),
  secretsCiphertext: text("secrets_ciphertext").notNull(), revision: text("revision").notNull(),
  updatedBy: text("updated_by").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [check("identity_login_config_singleton", sql`${t.id}=1`)]);
export const authenticationEvents = sqliteTable("authentication_events", {
  id: text("id").primaryKey(), method: text("method").notNull(), outcome: text("outcome").notNull(),
  actor: text("actor").notNull(), reason: text("reason").notNull(), createdAt: text("created_at").notNull(),
}, t => [index("authentication_events_created").on(sql`${t.createdAt} DESC`, sql`${t.id} DESC`)]);
export const authenticationStates = sqliteTable("authentication_states", {
  idHash: text("id_hash").primaryKey(), browserHash: text("browser_hash").notNull(), revision: text("revision").notNull(),
  payload: text("payload").notNull(), expiresAt: integer("expires_at").notNull(), consumed: integer("consumed").notNull().default(0),
}, t => [index("authentication_states_expiry").on(t.expiresAt)]);
export const authenticationBindings = sqliteTable("authentication_bindings", {
  provider: text("provider").notNull(), subject: text("subject").notNull(), userId: text("user_id").notNull(), createdAt: text("created_at").notNull(),
}, t => [primaryKey({columns:[t.provider,t.subject]}),unique().on(t.provider,t.userId)]);
export const authenticationLimits = sqliteTable("authentication_limits", {
  keyHash: text("key_hash").primaryKey(), attempts: integer("attempts").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [index("authentication_limits_expiry").on(t.expiresAt)]);
export const authenticationSessionMethods = sqliteTable("authentication_session_methods", {
  idHash: text("id_hash").primaryKey(), method: text("method").notNull(), expiresAt: text("expires_at").notNull(),
});
