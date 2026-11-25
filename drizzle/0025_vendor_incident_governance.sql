CREATE TABLE IF NOT EXISTS security_vendor_incidents (
  id TEXT PRIMARY KEY,
  dependency_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  service_impact TEXT NOT NULL,
  provider_notice_at TEXT NOT NULL,
  regulatory_deadline TEXT NOT NULL,
  notification_scope TEXT NOT NULL,
  sla_clause TEXT NOT NULL,
  contractual_breach TEXT NOT NULL,
  response_owner TEXT NOT NULL,
  corrective_plan TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  reported_at TEXT NOT NULL,
  provider_evidence TEXT,
  actual_recovery_minutes INTEGER,
  submitted_by TEXT,
  submitted_at TEXT,
  verified_by TEXT,
  verified_at TEXT,
  verification_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_vendor_incidents_tenant_status ON security_vendor_incidents (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_incidents_dependency ON security_vendor_incidents (dependency_id, tenant_id);
