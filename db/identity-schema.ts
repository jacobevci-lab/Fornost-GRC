import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
});
