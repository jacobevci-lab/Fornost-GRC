import test from 'node:test';
import assert from 'node:assert/strict';
import type {DatabaseSync} from 'node:sqlite';
import {projectEnterpriseWork} from '../app/enterprise-work';
import {matchesWorkIdentity, workCompletionDate} from '../app/work-queue';
import {fixture} from './helpers/enterprise-route-fixture';
import {accountViewState,canReadView} from '../app/account-views';

const incident = {id:'INC-1', code:'INC-001', title:'Identity compromise', status:'declared', severity:'high',
  owner:'owner@example.com', commander:'commander@example.com', reviewer:'reviewer@example.com',
  createdAt:'2026-10-01T10:00:00.000Z', updatedAt:'2026-10-28T10:00:00.000Z', completedAt:null};
const project = (incidents:unknown, complete=true) => projectEnterpriseWork('incidents',{incidents,complete});

test('saved incident queue criteria retain module access and never grant enterprise access',()=>{
  const state={query:'Incident',filters:{module:'Güvenlik Olayları',status:'priority'},columns:['title','status']};
  assert.deepEqual(accountViewState('My Work',state),state);
  assert.equal(canReadView({role:'Viewer',moduleAccess:{mode:'full'}},'My Work',state),true);
  assert.equal(canReadView({role:'Viewer',moduleAccess:{mode:'scoped',modules:{Kanıtlar:'read'}}},'My Work',state),false);
});

function seed(db:DatabaseSync, values:Record<string,string|number|null>) {
  const row:Record<string,string|number|null> = {};
  for (const column of db.prepare('PRAGMA table_info(enterprise_incidents)').all())
    if(column.notnull && !column.dflt_value) row[String(column.name)] = column.type==='INTEGER'?0:'fixture';
  Object.assign(row,{id:incident.id,code:incident.code,title:incident.title,status:incident.status,severity:incident.severity,
    owner:incident.owner,commander:incident.commander,reviewer:incident.reviewer,declared_by:incident.owner,
    declared_at:incident.createdAt,updated_at:incident.updatedAt,detected_date:'2026-10-01'},values);
  db.prepare(`INSERT INTO enterprise_incidents(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
}

test('incident inbox assigns response and independent closure by all lifecycle states without invented dates',()=>{
  for(const status of ['declared','triage','contained','eradicated','recovered','review','closed']) {
    const result=project([{...incident,status,completedAt:status==='closed'?incident.updatedAt:null}]);
    assert.equal(result.complete,true);assert.equal(result.rows.length,1);
    const row=result.rows[0];assert.equal(row.nativeRef,incident.id);assert.equal(row.module,'Güvenlik Olayları');
    assert.equal(row.workKind,'incident');assert.equal(row.data.owner,incident.owner);assert.equal(row.data.actionOwner,incident.commander);
    assert.equal(row.data.reviewer,['review','closed'].includes(status)?incident.reviewer:'');
    assert.equal(row.data.workWaitingForReview,status==='review');assert.equal(row.data.workClosed,status==='closed');
    assert.equal(row.data.dueDate,undefined);assert.equal(row.data.severity,'high');
    assert.equal(matchesWorkIdentity([String(row.data.owner)],{email:'owner@example.com.attacker'}),false);
  }
});

test('closure uses the real closure time and never recent edits or creation',()=>{
  for(const completedAt of [null,'','2020-01-01T00:00:00Z']) {
    const row=project([{...incident,status:'closed',completedAt}]).rows[0];
    assert.equal(workCompletionDate(row),completedAt||'');
  }
  assert.equal(workCompletionDate(project([incident]).rows[0]),'');
});

test('malformed, duplicated and bounded incident sources cannot appear complete',()=>{
  for(const value of [null,{},[incident,incident],
    ...[{title:''},{code:''},{id:''},{status:'unknown'},{severity:'urgent'},
      {owner:'owner@example.com;other@example.com'},{reviewer:incident.owner.toUpperCase()},
      {updatedAt:'2026-02-31T00:00:00Z'},{createdAt:'not-a-time'},
      {completedAt:incident.updatedAt},{status:'closed',completedAt:'not-a-time'}].map(change=>[{...incident,...change}])]) {
    const result=project(value);assert.equal(result.complete,false,JSON.stringify(value));assert.equal(result.rows.length,0);
  }
  assert.equal(project([incident],false).complete,false);
  assert.deepEqual(project([]),{rows:[],complete:true});
  assert.equal(projectEnterpriseWork('incidents',{incidents:[]}).complete,false);
});

test('actual incident work GET is metadata-only, read-only and preserves the real closure timestamp',async()=>{
  const f=fixture('incidents');
  try {
    await f.get('view=work');
    seed(f.sqlite,{description:'private narrative',business_impact:'private impact',root_cause:'private root cause',evidence_reference:'private reference',status:'review'});
    const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
    const read=await f.get('view=work');assert.equal(read.status,200);assert.equal(read.body.complete,true);
    assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
    assert.doesNotMatch(JSON.stringify(read.body),/private|description|businessImpact|rootCause|evidence|events|assetRefs|notification|detectedDate/i);
    assert.equal(projectEnterpriseWork('incidents',read.body).complete,true);
    const close=await f.post({action:'transition',incidentId:incident.id,operation:'close',note:'Independent closure reviewed.',confirmation:'OLAYI KAPAT',evidenceReference:'legacy evidence',evidenceSha256:'a'.repeat(64),notificationDecision:'not-required',notificationRationale:'Independent response review documented the notification decision.'});
    assert.equal(close.status,200);
    const closed=projectEnterpriseWork('incidents',(await f.get('view=work')).body).rows[0];
    assert.equal(closed.data.workClosed,true);assert.equal(closed.completedAt,f.sqlite.prepare('SELECT closed_at FROM enterprise_incidents').get()!.closed_at);
    const reopened=await f.post({action:'transition',incidentId:incident.id,operation:'reopen',note:'New response work requires reopening.',confirmation:'OLAYI YENİDEN AÇ'});assert.equal(reopened.status,200);
    const active=projectEnterpriseWork('incidents',(await f.get('view=work')).body).rows[0];
    assert.equal(active.data.status,'triage');assert.equal(active.data.workClosed,false);assert.equal(workCompletionDate(active),'');
    assert.equal(active.data.reviewer,'');
    assert.equal((await f.get('view=work&view=history')).status,400);assert.equal((await f.get('view=work&format=csv')).status,400);
  } finally {f.sqlite.close();}
});

test('incident inbox distinguishes exact capacity from overflow, prioritizes active work and recent closure',async()=>{
  const f=fixture('incidents');
  try {
    await f.get('view=work');
    for(let i=0;i<2000;i++) seed(f.sqlite,{id:'INC-'+i,code:'INC-'+i,status:'closed',closed_at:'2020-01-01T00:00:00Z'});
    let result=await f.get('view=work');assert.equal(result.body.complete,true);assert.equal(projectEnterpriseWork('incidents',result.body).complete,true);
    seed(f.sqlite,{id:'recent',code:'recent',status:'closed',closed_at:incident.updatedAt});
    seed(f.sqlite,{id:'active',code:'active',status:'triage',severity:'low'});
    result=await f.get('view=work');assert.equal(result.body.complete,false);
    const rows=projectEnterpriseWork('incidents',result.body);assert.equal(rows.complete,false);assert.equal(rows.rows.length,2000);
    assert.equal(rows.rows[0].nativeRef,'active');assert.equal(rows.rows[1].nativeRef,'recent');
    assert.equal(project(Array.from({length:2001},(_,i)=>({...incident,id:String(i)}))).rows.length,2000);
  } finally {f.sqlite.close();}
});

test('incident inbox failed reads return an unavailable result, never an empty successful queue',async()=>{
  const f=fixture('incidents'),prepare=f.db.prepare.bind(f.db);
  try {
    f.db.prepare=((sql:string)=>sql.startsWith('SELECT id,code,title,status,severity')?{bind(){return{all:async()=>{throw new Error('read unavailable');}};}}:prepare(sql)) as typeof f.db.prepare;
    const result=await f.get('view=work');assert.equal(result.status,503);assert.equal(result.body.code,'INCIDENT_SOURCE_UNAVAILABLE');assert.equal(result.body.incidents,undefined);
  } finally {f.sqlite.close();}
});
