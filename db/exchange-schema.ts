import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const exchangeConnectors = sqliteTable("exchange_connectors", {
  kind: text("kind").primaryKey(),
  config: text("config").notNull(),
  secret: text("secret"),
  hookHash: text("hook_hash"),
  enabled: integer("enabled").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const exchangeSignals = sqliteTable(
  "exchange_signals",
  {
    kind: text("kind"),
    eventId: text("event_id"),
    observedAt: text("observed_at").notNull(),
    summary: text("summary").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.eventId] })],
);

export const exchangeTickets = sqliteTable("exchange_tickets", {
  findingId: text("finding_id").primaryKey(),
  provider: text("provider").notNull(),
  ticket: text("ticket").unique(),
  url: text("url"),
  state: text("state").notNull(),
});

export const exchangeNotices = sqliteTable("exchange_notices", {
  id: text("id").primaryKey(),
  state: text("state").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const vendorInvitations = sqliteTable(
  "vendor_invitations",
  {
    digest: text("digest").primaryKey(),
    vendorId: text("vendor_id").notNull(),
    email: text("email").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdBy: text("created_by").notNull(),
    draftId: text("draft_id"),
    draftRevision: text("draft_revision"),
    receipt: text("receipt").unique(),
  },
  (t) => [index("vendor_invitations_vendor").on(t.vendorId)],
);

export const trustPublication = sqliteTable("trust_publication", {
  id: integer("id").primaryKey(),
  config: text("config").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const trustRequests = sqliteTable(
  "trust_requests",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id").notNull(),
    name: text("name").notNull(),
    company: text("company").notNull(),
    email: text("email").notNull(),
    acknowledgedAt: text("acknowledged_at").notNull(),
    ndaVersion: text("nda_version").notNull(),
    status: text("status").notNull().default("pending"),
    grantHash: text("grant_hash").unique(),
    expiresAt: text("expires_at"),
    decidedBy: text("decided_by"),
    decidedAt: text("decided_at"),
  },
  (t) => [index("trust_requests_queue").on(t.status, t.acknowledgedAt)],
);

export const exchangeRate = sqliteTable("exchange_rate", {
  id: text("id").primaryKey(),
  attempts: integer("attempts").notNull(),
  expires: integer("expires").notNull(),
});

export const boardPackages = sqliteTable("board_packages", {
  id: text("id").primaryKey(),
  snapshot: text("snapshot").notNull(),
  digest: text("digest").notNull(),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull(),
});

export const vendorInvitationDetails=sqliteTable("vendor_invitation_details",{digest:text("digest").primaryKey().notNull(),scope:text("scope").notNull(),createdAt:text("created_at").notNull(),revokedAt:text("revoked_at")});
export const trustRequestDetails=sqliteTable("trust_request_details",{requestId:text("request_id").primaryKey().notNull(),reason:text("reason").notNull(),ndaRequired:integer("nda_required").notNull(),acceptedAt:text("accepted_at")});
