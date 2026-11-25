import {frameworkTemplateCatalogs} from "../app/api/grc/framework-catalogs";
import {parseGrcCursor,readAllGrcPages} from "../app/grc-pagination";
import asvs from "../app/api/grc/catalog-data/owasp-asvs.json";
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {nistCatalogs} from '../app/api/grc/nist-catalogs';
import {iso27001Management} from '../app/api/grc/iso27001-management';
import {validateCatalogImport,readCatalogRequest,MAX_CATALOG_BYTES} from '../app/audit-catalog-import';
import {auditRequirementInserts} from '../app/audit-create-batch';
const pack={name:'Internal',version:'1',source:'https://example.com/source',rightsConfirmed:true,requirements:[{ref:'A.1',title:'Review',category:'Access',statement:'Check access approvals.'}]};
test('pinned NIST packs contain complete active sets, text, unique references and no withdrawn controls',()=>{
 assert.deepEqual(nistCatalogs.map(c=>c.requirements.length),[1014,97,103,61]);
 for(const catalog of nistCatalogs){assert.equal(new Set(catalog.requirements.map(r=>r.ref)).size,catalog.requirements.length);assert.match(catalog.sourceSha256,/^[a-f0-9]{64}$/);assert.match(catalog.source,/78650f02ad9321bb7b817846f8fbd4f2bcd620de/);for(const r of catalog.requirements){assert.ok(r.statement.length>10,r.ref);assert.ok(!catalog.withdrawn.includes(r.ref));assert.doesNotMatch(r.statement,/\{\{\s*insert:/);}}
 assert.equal(iso27001Management.length,30);assert.ok(iso27001Management.find(r=>r.ref==='4.1')?.title.includes('iklim'));
});
test('import rejects malformed catalogs, duplicate identifiers, unsafe links and missing rights',()=>{
 assert.equal(validateCatalogImport(pack).requirements.length,1);
 for(const value of [null,{}, {...pack,rightsConfirmed:false},{...pack,source:'javascript:alert(1)'},{...pack,source:'https://user:pass@example.com/'},{...pack,requirements:[]},{...pack,requirements:[pack.requirements[0],{...pack.requirements[0],ref:'a.1'}]},{...pack,requirements:[{...pack.requirements[0],statement:''}]}])assert.throws(()=>validateCatalogImport(value));
 assert.equal(validateCatalogImport({...pack,rightsConfirmed:false},false).rightsConfirmed,false);
});
test('streamed JSON limit works without a Content-Length header',async()=>{
 assert.deepEqual(await readCatalogRequest(new Request('https://local',{method:'POST',body:JSON.stringify(pack)})),pack);
 await assert.rejects(readCatalogRequest(new Request('https://local',{method:'POST',body:' '.repeat(MAX_CATALOG_BYTES+1)})),/exceeds/);
});
test('large catalog inserts stay below D1 limits and roll back as a transaction',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT)');
 const statements=auditRequirementInserts('audit',nistCatalogs[0].requirements,'now');assert.ok(statements.length<100);
 try{db.exec('BEGIN');for(const s of statements){assert.ok(s.values.length<=100);db.prepare(s.sql).run(...s.values);}db.exec('COMMIT');assert.equal(db.prepare('SELECT COUNT(*) n FROM simple_grc_records').get()?.n,1014);
 db.exec('BEGIN');assert.throws(()=>{for(const s of auditRequirementInserts('other',nistCatalogs[0].requirements,'now'))db.prepare(s.sql).run(...s.values);db.prepare(statements[0].sql).run(...statements[0].values);});db.exec('ROLLBACK');assert.equal(db.prepare('SELECT COUNT(*) n FROM simple_grc_records').get()?.n,1014);
 }finally{db.close();}
});

test("ASVS includes 345 versioned requirements with attribution",()=>{assert.equal(asvs.requirements.length,345);assert.equal(new Set(asvs.requirements.map(r=>r.ref)).size,345);assert.ok(asvs.requirements.every(r=>r.ref.startsWith("v5.0.0-")&&r.statement.length>20&&r.guidance.includes("CC BY-SA 4.0")));});

test('record pagination reads past 5000 without accepting repeated cursors',async()=>{
 assert.equal(parseGrcCursor(null),null);assert.throws(()=>parseGrcCursor('{"createdAt":3,"id":"x"}'));
 const rows=await readAllGrcPages(async cursor=>cursor?{rows:[5001],nextCursor:null}:{rows:Array.from({length:5000},(_,i)=>i+1),nextCursor:'next'});assert.equal(rows.length,5001);assert.equal(rows.at(-1),5001);
 await assert.rejects(readAllGrcPages(async()=>({rows:[],nextCursor:'same'})),/Repeated/);
});

test("CSF has full English statements alongside all Turkish topic summaries",()=>{assert.ok(frameworkTemplateCatalogs["NIST Cybersecurity Framework (CSF) 2.0"].every(r=>r.statement&&r.statement.length>10));});
