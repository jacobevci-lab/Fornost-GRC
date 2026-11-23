import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {vendorCode} from '../app/third-party-risk/inventory';

const sql = execFileSync('python3', ['scripts/prepare-entra-code-repair.py'], {encoding:'utf8'});
const migration = (file:string) => readFileSync('drizzle/' + file, 'utf8');
const coreSchema = migration('0078_core_grc_support_tables.sql');
const shortCode = (db:DatabaseSync, id:string) =>
  db.prepare('SELECT code FROM simple_grc_record_codes WHERE record_id=?').get(id)?.code;

function legacyDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(coreSchema);
  db.exec(`
    CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,created_at TEXT);
    CREATE TABLE third_party_profiles(vendor_id TEXT PRIMARY KEY);
    CREATE TABLE enterprise_incidents(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE d1_migrations(name TEXT PRIMARY KEY);
    INSERT INTO d1_migrations VALUES('0076');
    INSERT INTO simple_grc_records VALUES('vendor-uuid','Tedarikçiler','today'),
      ('VEN-005','Tedarikçiler','today'),('supplier-external','Tedarikçiler','today'),
      ('risk-uuid','Risk Assessment','today');
    INSERT INTO third_party_profiles VALUES('profile-only'),('vendor-uuid');
    INSERT INTO enterprise_incidents VALUES('incident-uuid','INC-2026-abc'),('short-incident','INC-043');
    INSERT INTO simple_grc_record_codes VALUES('supplier-external','Tedarikçiler','ERP-X','today');
  `);
  return db;
}

test('scoped repair preserves links and imported identities, covers both registers and supports a retry', () => {
  const db = legacyDatabase();
  try {
    db.exec(sql);
    assert.equal(shortCode(db,'VEN-005'),'VEN-005');
    assert.match(String(shortCode(db,'vendor-uuid')), /^VEN-\d{3,}$/);
    assert.match(String(shortCode(db,'profile-only')), /^VEN-\d{3,}$/);
    assert.equal(shortCode(db,'supplier-external'),'ERP-X');
    const display = shortCode(db,'map:display:supplier-external');
    assert.match(String(display), /^VEN-\d{3,}$/);
    assert.equal(vendorCode('ERP-X','supplier-external',display),display);
    assert.equal(vendorCode('VEN-005','supplier-external',display),'VEN-005');
    assert.match(String(shortCode(db,'enterprise:incident:incident-uuid')), /^INC-\d{3,}$/);
    assert.equal(shortCode(db,'enterprise:incident:short-incident'),'INC-043');
    assert.equal(shortCode(db,'risk-uuid'),undefined);
    assert.equal(db.prepare('SELECT count(*) n FROM d1_migrations').get()?.n,1);
    assert.equal(db.prepare("SELECT code FROM enterprise_incidents WHERE id='incident-uuid'").get()?.code,'INC-2026-abc');
    const codes = () => db.prepare('SELECT * FROM simple_grc_record_codes ORDER BY record_id').all();
    const first = codes();
    db.exec(sql);
    assert.deepEqual(codes(),first);
    db.exec("INSERT INTO enterprise_incidents VALUES('fresh','INC-2026-xyz'); INSERT INTO third_party_profiles VALUES('new-vendor');");
    assert.equal(shortCode(db,'enterprise:incident:fresh'),'INC-044');
    assert.match(String(shortCode(db,'new-vendor')), /^VEN-\d{3,}$/);
  } finally { db.close(); }
});

test('an unrepairable imported display identity aborts the entire scoped transaction', () => {
  const db = legacyDatabase();
  try {
    db.exec("INSERT INTO simple_grc_record_codes VALUES('map:display:supplier-external','Tedarikçiler','external-alias','today')");
    db.exec('BEGIN');
    assert.throws(() => db.exec(sql),/CHECK constraint failed/);
    db.exec('ROLLBACK');
    assert.equal(shortCode(db,'vendor-uuid'),undefined);
    assert.equal(shortCode(db,'map:display:supplier-external'),'external-alias');
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='map_code_incident'").get()?.n,0);
  } finally { db.close(); }
});

test('the scoped runtime repair coexists with the full subsequent migration sequence', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const files = readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort();
    const pending = files.findIndex(f => f.startsWith('0077_'));
    assert.ok(pending > 0);
    for (const f of files.slice(0,pending)) db.exec(migration(f));
    db.exec(coreSchema);
    db.exec("INSERT INTO simple_grc_records VALUES('preserved-vendor','Tedarikçiler','{}','today','today')");
    db.exec(sql);
    const original = shortCode(db,'preserved-vendor');
    assert.match(String(original),/^VEN-\d{3,}$/);
    for (const f of files.slice(pending)) db.exec(migration(f));
    db.exec(sql);
    assert.equal(shortCode(db,'preserved-vendor'),original);
  } finally { db.close(); }
});
