import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,actor} from './helpers/agent-fixture';
import {createScopedRecord} from '../app/enterprise/intake';
import {enterpriseProjection} from '../app/enterprise/projection';
import {resolveScope} from '../app/enterprise/scope';
import {listRecords,type Kind} from '../app/enterprise/register';
import {annualLossMinor,singleLossMinor,readEstimate,exposure} from '../app/enterprise/fair';
import {enroll,readMatrix,saveDecision,programOverview,ensurePosture} from '../app/framework-posture/store';
import {verifyControl} from '../app/framework-posture/verification';
import {ISO,SOC} from '../app/framework-posture/catalog';
import {appendEvidenceVersion} from '../app/evidence/versioning';

const fair={currency:'TRY' as const,frequency:25,minimum:100,likely:200,maximum:600};
test('FAIR-Lite uses unrounded PERT severity for ALE and keeps currencies distinct',()=>{
 assert.equal(singleLossMinor(fair),BigInt(25000));assert.equal(annualLossMinor(fair),BigInt(6250));
 for(const frequency of [0,.99,100.01,-1,NaN,Infinity])assert.equal(readEstimate({...fair,frequency}),null);
 for(const frequency of [1,100])assert.ok(readEstimate({...fair,frequency}));
 assert.equal(readEstimate({...fair,minimum:201}),null);
 assert.equal(readEstimate({...fair,currency:'GBP'}),null);
 assert.equal(singleLossMinor({...fair,minimum:0,likely:0,maximum:.03}),BigInt(1));
 const x=exposure([{data:{fairLite:fair}},{data:{fairLite:{...fair,currency:'USD'}}},{data:{}}]);
 assert.deepEqual([...x.totals],[['TRY',BigInt(6250)],['USD',BigInt(6250)]]);assert.equal(x.measured,2);assert.equal(x.total,3);
});

test('all ten native families create canonical codes, entity assignments and audit receipts atomically',async()=>{
 const {db,sql}=await fixture();
 sql.exec("INSERT INTO org_entities VALUES('a','root','company','A'),('b','root','company','B');INSERT INTO org_user_roles VALUES('owner','contributor','1');INSERT INTO org_memberships VALUES('owner','a')");
 const user={...actor,orgScope:await resolveScope(db,actor,'a')};
 const date=new Date().toISOString().slice(0,10),title='Enterprise native test',description='Detailed enterprise record description for review';
 const create=async(kind:Kind,values:object)=>{
  const body={kind,entity:'a',requestId:crypto.randomUUID(),values};
  const out=await createScopedRecord(db,user,body);assert.match(out.code,/^(AST|RSK|BIA|VEN|CTL|POL|AUD|FND|INC|AIS)-\d{3,}$/);
  assert.equal(sql.prepare('SELECT org_entity_id FROM org_record_entities WHERE kind=? AND record_id=?').get(kind,out.id)!.org_entity_id,'a');
  assert.equal((await createScopedRecord(db,user,body)).id,out.id);
  assert.equal((await listRecords(db,user,kind,0,out.id)).rows.length,1);
  return out;
 };
 const ast=await create('asset',{title,description,assetType:'Sunucu',criticality:'Yüksek'});
 await create('risk',{title,description,asset:ast.id,inherentLikelihood:'3',inherentImpact:'4',fairLite:fair});
 await create('bia',{title,description,asset:ast.id,processCategory:'Operations',criticality:'Yüksek',rto:'4',rpo:'1',mtpd:'8'});
 await create('vendor',{title,service:'Cloud infrastructure service',criticality:'Yüksek',riskLevel:'Orta'});
 await create('control',{title,description,frequency:'Aylık',testOwner:'owner@example.test'});
 await create('policy',{title,reviewer:'reviewer@example.test',audience:'Employees',category:'security',classification:'internal',reviewFrequencyDays:'365'});
 await create('audit',{title,reviewer:'reviewer@example.test',periodStart:date,periodEnd:date,targetDate:date});
 await create('finding',{title,description,severity:'medium',reviewer:'reviewer@example.test',rootCause:'Documented root cause',correctiveAction:'Documented corrective action with accountable owner',preventiveAction:'Documented prevention plan with follow-up testing',dueDate:date});
 await create('incident',{title,description,severity:'medium',asset:ast.id,reviewer:'reviewer@example.test',commander:'owner@example.test',businessImpact:'Service unavailable to business users',detectedDate:date,category:'availability',dataClassification:'Internal',personalData:'no'});
 await create('ai',{title,description,reviewer:'reviewer@example.test',technical:'owner@example.test',model:'Local model',provider:'Internal',architecture:'llm',deployment:'private',risk:'high',sources:'sensitive',controlNotes:'Controls require independent assessment',reviewDate:date,impact:'3',likelihood:'3',sensitivity:'3',autonomy:'1',maturity:'1'});
 const projection=await enterpriseProjection(db,user);
 for(const kind of ['asset','risk','bia','vendor','control','policy','audit','finding','incident','ai'] as Kind[])assert.equal(projection.counts[kind],1,kind);
 assert.equal(projection.financial.totals.TRY,'6250');assert.equal(projection.financial.measured,1);
 assert.ok(projection.edges.some(e=>e.to==='asset:'+ast.id));
 const sibling={...actor,orgScope:await resolveScope(db,actor,'b')};
 assert.equal((await enterpriseProjection(db,sibling)).nodes.length,0);
 assert.equal(sql.prepare("SELECT count(*) n FROM org_access_events WHERE action='org-record-create'").get()!.n,10);
});

test('scope and module intersections reject guessed records, forged approvals, cross-entity links and revoked grants',async()=>{
 const {db,sql}=await fixture();
 sql.exec("INSERT INTO org_entities VALUES('a','root','company','A'),('b','root','company','B');INSERT INTO org_user_roles VALUES('owner','contributor','1');INSERT INTO org_memberships VALUES('owner','a')");
 const base={...actor,id:'owner',email:'owner@example.test',name:'owner',role:'Editor' as const};
 const user={...base,orgScope:await resolveScope(db,base,'a')};
 const body={kind:'risk',entity:'a',requestId:crypto.randomUUID(),values:{title:'Risk in A',description:'Risk scope',asset:'asset',inherentLikelihood:'3',inherentImpact:'4'}};
 await assert.rejects(createScopedRecord(db,user,body)); // root asset cannot cross into A
 await assert.rejects(createScopedRecord(db,user,{...body,entity:'b'}));
 await assert.rejects(createScopedRecord(db,user,{...body,kind:'asset',values:{title:'Asset in A',description:'Scoped',assetType:'Sunucu',criticality:'Yüksek',status:'Onaylandı'}}));
 assert.deepEqual((await listRecords(db,user,'asset',0,'asset')).rows,[]);
 assert.equal(JSON.stringify(await enterpriseProjection(db,user)).includes('Entra ID'),false);
 const asset={kind:'asset',entity:'a',requestId:crypto.randomUUID(),values:{title:'Asset in A',description:'Scoped',assetType:'Sunucu',criticality:'Yüksek'}};
 sql.exec("INSERT INTO user_module_access(user_id,policy_json,updated_by,updated_at) VALUES('owner','{\"mode\":\"scoped\",\"modules\":{}}','admin','now')");
 await assert.rejects(createScopedRecord(db,user,asset));
 sql.exec("DELETE FROM user_module_access;DELETE FROM org_memberships WHERE user_id='owner'");
 await assert.rejects(createScopedRecord(db,user,asset));
 assert.equal(sql.prepare("SELECT count(*) n FROM org_access_events WHERE action='org-record-create'").get()!.n,0);
});

test('one independently verified control updates ISO and SOC together; source changes retract both',async()=>{
 const {db,sql,record}=await fixture();await ensurePosture(db);
 record('ctl','Kontroller',{controlTitle:'Enforced MFA',owner:'owner@example.test',status:'Aktif',implementation:'Uygulanıyor'});
 sql.prepare("INSERT INTO simple_grc_record_codes VALUES('ctl','Kontroller','CTL-001','now')").run();
 for(const [name,ref,applicability] of [[ISO,'A.5.15','included'],[SOC,'CC6.1','required']]){await enroll(db,name,actor.email);await saveDecision(db,{name,ref,applicability,reason:'In scope',revision:'',links:[{id:'ctl',coverage:'supports'}]},actor.email);}
 await readMatrix(db,ISO);
 const version=await appendEvidenceVersion(db,{evidenceId:'EVD-test',fileKey:'evidence/mfa.txt',fileName:'mfa.txt',fileType:'text/plain',fileSize:20,contentSha256:'a'.repeat(64),evidenceTitle:'MFA enforced',owner:'owner@example.test',period:'2026',frameworks:ISO,controlRefs:'CTL-001',changeNote:'Initial',createdBy:'owner@example.test',createdAt:new Date().toISOString()});
 const ev=sql.prepare("SELECT id FROM evidence_versions WHERE evidence_id='EVD-test'").get()!;
 record('EVD-test','Kanıtlar',{evidenceTitle:'MFA enforced',owner:'owner@example.test',reviewer:'reviewer@example.test',reviewStatus:'approved',reviewedBy:'reviewer@example.test',reviewedVersion:ev.id,status:'Onaylandı',period:'2026',contentSha256:'a'.repeat(64),versionNo:version.versionNo,versionChainSha256:version.chainSha256,controlRef:'CTL-001'});
 const before=await programOverview(db);assert.equal(before.coverage[ISO].compliant,0);assert.equal(before.coverage[SOC].compliant,0);
 const body={name:ISO,controlId:'ctl',evidenceVersion:ev.id,note:'Independent test confirmed enforced MFA against the approved evidence.'};
 await assert.rejects(verifyControl(db,{...actor,id:'owner',email:'owner@example.test',name:'owner',role:'Editor'},body));
 await verifyControl(db,actor,body);
 const after=await programOverview(db);assert.equal(after.coverage[ISO].compliant,1);assert.equal(after.coverage[SOC].compliant,1);assert.equal(after.controlFrameworks.ctl.length,2);
 const privateMatrix=await readMatrix(db,ISO,['unrelated']);assert.equal(privateMatrix.controls.length,0);assert.equal(Object.keys(privateMatrix.pins).length,0);assert.ok(privateMatrix.requirements.every(r=>r.links.length===0));
 assert.equal((await programOverview(db,['unrelated'])).coverage[ISO].compliant,0);
 sql.exec("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.description','Changed configuration') WHERE id='ctl'");
 const stale=await programOverview(db);assert.equal(stale.coverage[ISO].compliant,0);assert.equal(stale.coverage[SOC].compliant,0);
 await verifyControl(db,actor,body);
 sql.exec("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.expiresAt','2020-01-01') WHERE id='EVD-test'");
 assert.equal((await programOverview(db)).coverage[SOC].compliant,0);
 await assert.rejects(verifyControl(db,actor,body));
});

test('authority revocation or entity reassignment during the native write commits no record, code or receipt',async()=>{
 for(const attack of ['membership','reference-move','module'] as const){
  const {db,sql}=await fixture();
  sql.exec("INSERT INTO org_entities VALUES('a','root','company','A'),('b','root','company','B');INSERT INTO org_user_roles VALUES('owner','contributor','1');INSERT INTO org_memberships VALUES('owner','a');INSERT INTO org_record_entities VALUES('asset','asset','a','','1')");
  const base={...actor,id:'owner',email:'owner@example.test',name:'owner',role:'Editor' as const},user={...base,orgScope:await resolveScope(db,base,'a')};
  // Preserve the real transactional adapter. Inject the race immediately before its native source insert.
  const queries=new WeakMap<object,string>();
  const prepare=(query:string):D1PreparedStatement=>{
   const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>{const bound=statement.bind.bind(statement);statement.bind=(...v:unknown[])=>wrap(bound(...v));queries.set(statement,query);return statement};
   return wrap(db.prepare(query));
  };
  let fired=false;
  const racing={...db,prepare,batch:async(statements:D1PreparedStatement[])=>{
   if(!fired&&statements.some(s=>queries.get(s)?.includes('INSERT INTO simple_grc_records(id,module,data_json'))){fired=true;
    if(attack==='membership')sql.exec("DELETE FROM org_memberships WHERE user_id='owner'");
    else if(attack==='reference-move')sql.exec("UPDATE org_record_entities SET org_entity_id='b',revision='2' WHERE record_id='asset'");
    else sql.exec("INSERT INTO user_module_access(user_id,policy_json,updated_by,updated_at) VALUES('owner','{\"mode\":\"scoped\",\"modules\":{}}','admin','now')");
   }
   return db.batch(statements);
  }} as D1Database;
  const token=crypto.randomUUID();
  await assert.rejects(createScopedRecord(racing,user,{kind:'risk',entity:'a',requestId:token,values:{title:'Concurrent scope test',description:'Detailed scope validation',asset:'asset',inherentLikelihood:'3',inherentImpact:'4'}}));
  assert.equal(fired,true);assert.equal(sql.prepare('SELECT count(*) n FROM simple_grc_records WHERE id=?').get('RSK-'+token)!.n,0);
  assert.equal(sql.prepare('SELECT count(*) n FROM simple_grc_record_codes WHERE record_id=?').get('RSK-'+token)!.n,0);
  assert.equal(sql.prepare('SELECT count(*) n FROM org_access_events WHERE id=?').get(token)!.n,0);
 }
});
