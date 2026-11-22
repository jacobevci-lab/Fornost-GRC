CREATE TABLE IF NOT EXISTS third_party_assurance_documents(
  vendor_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('iso','soc','dpa','pentest','bcdr')),
  revision TEXT NOT NULL, evidence_id TEXT NOT NULL, version_id TEXT NOT NULL, version_no INTEGER NOT NULL,
  title TEXT NOT NULL, sha256 TEXT NOT NULL, expires TEXT NOT NULL, PRIMARY KEY(vendor_id,kind)
);
