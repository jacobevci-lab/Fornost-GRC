import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {findingCodeSchema} from '../app/findings/codes';
import {resolveFindingSource,searchFindingSources} from '../app/findings/source-records';
import {fixture} from './helpers/enterprise-route-fixture';

test('finding number migration preserves existing numbers and allocates stable aliases across restarts',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec(readFileSync('drizzle/0078_core_grc_support_tables.sql','utf8'));
  db.exec('CREATE TABLE enterprise_findings(id TEXT PRIMARY KEY,code TEXT UNIQUE,detected_at TEXT)');
  const insert=db.prepare('INSERT INTO enterprise_findings VALUES(?,?,?)');
  insert.run('newer','FND-2026-BBBBBBBB','2026-09');insert.run('older','FND-2026-AAAAAAAA','2025-09');insert.run('numbered','FND-012','2026-01');
  const migration=readFileSync('drizzle/0111_finding_codes.sql','utf8').split('\n').slice(1).join('\n').trim();
  assert.equal(migration,findingCodeSchema.join(';\n\n')+';');
  db.exec(migration);db.exec(migration);
  insert.run('promoted','FND-origin','2026-10');
  const rows=db.prepare("SELECT a.legacy_code,f.code FROM enterprise_finding_code_aliases a JOIN enterprise_findings f ON f.id=a.finding_id").all();
  assert.deepEqual(Object.fromEntries(rows.map(r=>[r.legacy_code,r.code])),{'FND-012':'FND-012','FND-2026-AAAAAAAA':'FND-013','FND-2026-BBBBBBBB':'FND-014','FND-origin':'FND-015'});
 }finally{db.close();}
});
test('six source catalogs resolve exact stored identities, Unicode titles, searchable aliases and mapped controls',async()=>{
 const f=fixture('findings',true);
 try{
  await f.post({});
  f.sqlite.exec(`CREATE TABLE evidence_automation_findings(id TEXT,title TEXT,rule_id TEXT,status TEXT);
    CREATE TABLE evidence_automation_rules(id TEXT,control_refs TEXT);
    CREATE TABLE third_party_profiles(vendor_id TEXT,name TEXT);
    CREATE TABLE third_party_findings(id TEXT,title TEXT);
    CREATE TABLE enterprise_incidents(id TEXT,title TEXT,code TEXT);
    CREATE TABLE regulatory_changes(id TEXT,title TEXT,external_ref TEXT);
    CREATE TABLE ai_findings(id TEXT,title TEXT);
    INSERT INTO simple_audits VALUES('aud','İç İnceleme','ISO','internal','a','b','open','d','d');
    INSERT INTO evidence_automation_rules VALUES('rule','CTL-001;CTL-002');
    INSERT INTO evidence_automation_findings VALUES('cc','İç İnceleme','rule','open');
    INSERT INTO third_party_profiles VALUES('ven','İç İnceleme');
    INSERT INTO simple_grc_record_codes VALUES('ven','Tedarikçiler','VEN-055','d');
    INSERT INTO enterprise_incidents VALUES('inc','İç İnceleme','INC-077');
    INSERT INTO ai_findings VALUES('ai','İç İnceleme');
    INSERT INTO regulatory_changes VALUES('reg','İç İnceleme','REG-A');
  `);
  for(const [source,id] of [['audit','aud'],['continuous-control','cc'],['vendor','ven'],['incident','inc'],['ai','ai'],['regulatory','reg']]){
   const result=await searchFindingSources(f.db,source,'iç inceleme');assert.equal(result.records[0].id,id);
   const selected=await resolveFindingSource(f.db,source,id);assert.equal(selected.title,'İç İnceleme');
   if(source==='continuous-control')assert.deepEqual(result.records[0].controls,['CTL-001','CTL-002']);
  }
  assert.equal((await searchFindingSources(f.db,'vendor','VEN-055')).records[0].id,'ven');
  await assert.rejects(resolveFindingSource(f.db,'incident','ven'));await assert.rejects(searchFindingSources(f.db,'constructor',''));
 }finally{f.sqlite.close();}
});
