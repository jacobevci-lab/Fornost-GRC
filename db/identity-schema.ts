import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
