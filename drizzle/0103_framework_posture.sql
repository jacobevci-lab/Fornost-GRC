CREATE TABLE IF NOT EXISTS framework_programs(
  name TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS framework_decisions(
  program TEXT NOT NULL,
  ref TEXT NOT NULL,
  applicability TEXT NOT NULL,
  reason TEXT NOT NULL,
  links TEXT NOT NULL,
  revision TEXT NOT NULL,
  actor TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(program,ref)
);
