CREATE TABLE IF NOT EXISTS regulatory_source_frameworks (
 source_id TEXT PRIMARY KEY REFERENCES regulatory_intelligence_sources(id) ON DELETE CASCADE,
 framework_names TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS regulatory_preliminary_impacts (
 change_id TEXT NOT NULL REFERENCES regulatory_changes(id) ON DELETE CASCADE,
 target_type TEXT NOT NULL CHECK(target_type IN ('control','policy','risk','process')),
 target_ref TEXT NOT NULL, target_title TEXT NOT NULL,
 PRIMARY KEY(change_id,target_type,target_ref)
);
