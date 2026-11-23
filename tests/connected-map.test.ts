import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {buildConnectedGrcGraph,type ConnectedGrcRow as Row} from '../app/connected-grc-model';
import {assuranceCoverage,mapCode,mapStats,mapTitle,connectedComponent,mergeMapRecords} from '../app/connected-map-model';
import {contextLinks} from '../app/connected-map-context';
import {issueChoice,linkChoices} from '../app/connected-map-links';
import {connectedIssues} from '../app/connected-grc-workbench-model';

const record=(id:string,module:string,data:Row['data']={}):Row=>({id,module,data});
const control=record('CTL-014','Kontroller');
const risk=record('RSK-001','Risk Assessment',{existingControls:control.id});
const evidence=record('EVD-001','Kanıtlar',{controlRef:control.id,status:'Onaylandı',reviewStatus:'approved',reviewedVersion:'v1'});
const audit=record('enterprise:audit:one','Denetim Yönetimi',{kind:'audit',auditName:'Annual',status:'Devam Ediyor',auditControlRefs:[control.id]});
const context=(a:Row,b:Row)=>({id:'edge',source_id:a.id,target_id:b.id,relation:'related' as const});
test('network coverage and focus use resolved relationships, hub counts distinct neighbours',()=>{
 const rows=[control,risk,evidence,audit,record('AST-002','Varlık Envanteri')];
 const {links}=buildConnectedGrcGraph(rows),network=mapStats(rows,links);
 assert.equal(network.coverage,80);assert.equal(network.ranked[0],control);
 assert.deepEqual(network.hubs,[control]);assert.equal(connectedComponent(control.id,network.adjacent).size,4);
 assert.equal(mapStats([],[]).coverage,null);
});
test('approvals, archived audits and operational CAPAs are independent of descriptive map edges',()=>{
 const stale=record('EVD-002','Kanıtlar',{...evidence.data,expiresAt:'2025-01-01'});
 const archived=record('enterprise:audit:two',audit.module,{...audit.data,archived:true});
 const pending=record('EVD-003','Kanıtlar',{...evidence.data,reviewedVersion:''});
 const finding=record('enterprise:finding:x','Bulgular ve CAPA',{kind:'finding',findingControlRef:control.id,status:'open'});
 const closed={...finding,id:'closed',data:{...finding.data,status:'closed'}};
 const other=record('EVD-004','Kanıtlar',{...evidence.data,controlRef:undefined});
 const rows=[control,risk,evidence,audit,stale,pending,archived,finding,closed,other];
 const links=[...buildConnectedGrcGraph(rows).links,...contextLinks(rows,[context(control,other)])];
 const coverage=assuranceCoverage(rows,links,new Date('2026-11-23'));
 for(const item of coverage){
   assert.deepEqual(item.approved,[evidence]);assert.deepEqual(item.audits,[audit]);assert.deepEqual(item.findings,[finding]);
   assert.equal(item.evidence.length,3);
 }
 assert.equal(coverage.length,2);
});
test('vendor projections collapse onto one canonical short code without leaking a UUID',()=>{
 const id='VEN-4fed5535-d8e5-4700-9be2-fc11b7ee56c7';
 const raw=record(id,'Tedarikçiler');
 const projection={...record('enterprise:vendor:'+id,raw.module,{kind:'vendor',vendorId:id,name:'Supplier'}),code:'VEN-012'};
 const rows=mergeMapRecords([raw],[projection]);assert.equal(rows.length,1);
 assert.equal(mapCode(rows[0]),'VEN-012');assert.equal(rows[0].id,id);assert.equal(mapTitle(raw,true),'Adsız kayıt');
 assert.equal(mapCode(raw),'—');
});
test('BIA gaps suggest a real plan, and control framework references use a typed mapping',()=>{
 const bia=record('BIA-010','BIA');
 const gap=connectedIssues([bia],[],[],[]).find(issue=>issue.kind==='plan')!;
 assert.equal(issueChoice(linkChoices(bia,{role:'Admin'}),gap)?.key,'plan');
 const framework=record('CMP-001','Uyum');
 assert.equal(contextLinks([control,framework],[{...context(control,framework),relation:'requirement-map'}])[0].relation,'control-framework');
 assert.deepEqual(contextLinks([risk,framework],[{...context(risk,framework),relation:'requirement-map'}]),[]);
});
test('D1 upgrade preserves existing vendor codes, repairs UUID codes and reserves independent audit codes',()=>{
 const db=new DatabaseSync(':memory:');
 try{
   const files=readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort();
   const update='0116_connected_map_codes.sql';
   for(const f of files.filter(n=>n<update))db.exec(readFileSync('drizzle/'+f,'utf8'));
   const add=db.prepare('INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES(?,?,\'{}\',\'2025-01-01\',\'2025-01-01\')');
   const code=db.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?,\'2025-01-01\')');
   add.run('old-vendor','Tedarikçiler');code.run('old-vendor','Tedarikçiler','VEN-014');
   add.run('VEN-legacy-uuid','Tedarikçiler');code.run('VEN-legacy-uuid','Tedarikçiler','VEN-legacy-uuid');
   add.run('AUD-001','Denetim Yönetimi');
   const get=(id:string)=>db.prepare('SELECT code FROM simple_grc_record_codes WHERE record_id=?').get(id)?.code;
   const migration=readFileSync('drizzle/'+update,'utf8');db.exec(migration);db.exec(migration);
   assert.equal(get('old-vendor'),'VEN-014');assert.equal(get('VEN-legacy-uuid'),'VEN-015');assert.equal(get('AUD-001'),'AUD-001');
   db.prepare('INSERT INTO simple_audits VALUES(?,?,?,?,?,?,?,?,?)').run('AUD-001','Annual','QA','Internal','Reviewer','Owner','open','2026-01-01','2026-01-01');
   assert.equal(get('enterprise:audit:AUD-001'),'AUD-002');
   add.run('AUD-001-REQ-1','Denetim Yönetimi');
   assert.equal(get('AUD-001-REQ-1'),'AUD-003');
   assert.equal(db.prepare('SELECT value FROM simple_grc_record_code_counters WHERE module=?').get('Denetim Yönetimi')?.value,3);
 }finally{db.close()}
});
