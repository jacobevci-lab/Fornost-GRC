"""Emit a scoped D1 import for the supplier and incident registries."""
import sqlite3
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parents[1] / "drizzle"


def statements(source):
    pending = ""
    for line in source.splitlines(keepends=True):
        if not pending and (not line.strip() or line.lstrip().startswith("--")):
            continue
        pending += line
        if sqlite3.complete_statement(pending):
            yield pending.strip()
            pending = ""
    if pending.strip():
        raise ValueError("Incomplete migration statement")


def repair_sql():
    # Use the same reservations, conflict policy and insert hooks as a full upgrade.
    canonical = list(statements((MIGRATIONS / "0116_connected_map_codes.sql").read_text()))
    parts = [(MIGRATIONS / "0106_tprm_vendor_codes.sql").read_text()]
    for prefix in (
        "CREATE VIEW IF NOT EXISTS connected_map_code_input ",
        "CREATE TRIGGER IF NOT EXISTS connected_map_allocate ",
        "INSERT INTO connected_map_code_input SELECT vendor_id,",
        "CREATE TRIGGER IF NOT EXISTS map_code_vendor_profile ",
        "INSERT INTO connected_map_code_input SELECT 'enterprise:incident:'",
        "CREATE TRIGGER IF NOT EXISTS map_code_incident ",
    ):
        matches = [sql for sql in canonical if sql.startswith(prefix)]
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one canonical statement starting with {prefix!r}")
        parts.append(matches[0])

    parts.append("""
CREATE VIEW fornost_entra_code_targets(id,module,prefix) AS
  SELECT id,'Tedarikçiler','VEN' FROM simple_grc_records WHERE module='Tedarikçiler'
  UNION SELECT vendor_id,'Tedarikçiler','VEN' FROM third_party_profiles
  UNION SELECT 'enterprise:incident:'||id,'Güvenlik Olayları','INC' FROM enterprise_incidents;

-- Imported external references stay intact. Reserve their display aliases as in 0117.
INSERT INTO connected_map_code_input
SELECT 'map:display:'||t.id,t.module,t.prefix,'' FROM fornost_entra_code_targets t
JOIN simple_grc_record_codes c ON c.record_id=t.id
WHERE c.code NOT GLOB t.prefix||'-[0-9][0-9][0-9]*' OR substr(c.code,5) GLOB '*[^0-9]*'
ORDER BY t.id;

-- Assert coverage inside the same atomic D1 import. An unexpected registry
-- shape or collision aborts the import before any changes are committed.
CREATE TABLE fornost_entra_code_check(missing INTEGER NOT NULL CHECK(missing=0));
INSERT INTO fornost_entra_code_check
SELECT count(*) FROM fornost_entra_code_targets t
WHERE NOT EXISTS (
  SELECT 1 FROM simple_grc_record_codes c
  WHERE c.record_id IN (t.id,'map:display:'||t.id) AND c.module=t.module
    AND c.code GLOB t.prefix||'-[0-9][0-9][0-9]*' AND substr(c.code,5) NOT GLOB '*[^0-9]*'
);
DROP TABLE fornost_entra_code_check;
DROP VIEW fornost_entra_code_targets;
""")
    return "\n\n".join(parts)


if __name__ == "__main__":
    print(repair_sql())
