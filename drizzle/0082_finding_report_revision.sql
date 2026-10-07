CREATE TABLE IF NOT EXISTS finding_report_revision(id INTEGER PRIMARY KEY CHECK(id=1),revision TEXT NOT NULL);
INSERT OR IGNORE INTO finding_report_revision(id,revision) VALUES(1,lower(hex(randomblob(16))));
CREATE TRIGGER IF NOT EXISTS finding_report_insert AFTER INSERT ON enterprise_findings BEGIN UPDATE finding_report_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS finding_report_update AFTER UPDATE ON enterprise_findings BEGIN UPDATE finding_report_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS finding_report_delete AFTER DELETE ON enterprise_findings BEGIN UPDATE finding_report_revision SET revision=lower(hex(randomblob(16))) WHERE id=1; END;
