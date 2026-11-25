import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { assessControl } from '../app/connectors/control-templates';
import { parseControlRunId, validControlAssessment, validControlRun } from '../app/connectors/control-run-contract';
import { readControlRun, InvalidStoredControlRun } from '../app/connectors/control-run-register';

const stamp = '2026-10-16T06:00:00.000Z';
const assess = (count = 2, failing = false) => assessControl('intune-compliance', 1, {providerId:'intune',dataset:'managed-devices'}, {
  value:Array.from({length:count}, (_, i) => ({id:String(i),complianceState:failing?'noncompliant':'compliant',lastSyncDateTime:stamp})),
  fornostCollection:{providerId:'intune',dataset:'managed-devices',complete:true,scope:'credential-visible',recordCount:count},
}, new Date(stamp));
const record = () => ({id:'RUN',ruleId:'RULE',ruleName:'Historical rule',sourceName:'Historical source',status:'pass',score:100,detail:'Saved result',createdAt:stamp,triggerType:'manual',durationMs:5,errorCode:null,evidenceId:'E',evidenceState:'available',assessment:assess()});

test('historical diagnostics accept real empty, passing, failing and bounded projections without current template assumptions', () => {
  const unknown={...assess(2,true),status:'error',failed:0,unknown:2,issues:assess(2,true).issues.map(item=>({...item,status:'unknown'}))};
  for (const value of [assess(),assess(0),assess(2,true),assess(140,true),unknown,{...assess(),templateId:'retired-template',templateVersion:5}]) assert.equal(validControlAssessment(value),true);
  const valid = assess(2,true);
  for (const patch of [{total:3},{score:100},{status:'pass'},{failed:-1},{unknown:0.5},{scope:'full-tenant'},{issues:[]},{issues:[null]},{issuesTruncated:true},{templateVersion:0},{evaluatedAt:'1'},{issues:valid.issues.map(item=>({...item,status:'pass'}))}]) assert.equal(validControlAssessment({...valid,...patch}),false,JSON.stringify(patch));
  assert.equal(validControlAssessment({...assess(140,true),issuesTruncated:false}),false);
  for(const value of [null,[],{},'bad']) assert.equal(validControlAssessment(value),false);
});

test('run results require exact run/rule identity, consistent diagnostics and explicit evidence availability', () => {
  assert.equal(validControlRun(record(),'RUN','RULE'),true);
  assert.equal(validControlRun({...record(),assessment:null,evidenceId:null,evidenceState:'none'},'RUN'),true);
  assert.equal(validControlRun({...record(),evidenceState:'missing'},'RUN'),true);
  for (const patch of [{id:'RUN-10'},{ruleId:'OTHER'},{score:0},{assessment:{...assess(),total:99}},{durationMs:-1},{createdAt:''},{createdAt:'0'},{status:'healthy'},{evidenceId:null},{evidenceState:'none'},{evidenceId:' E'},{errorCode:3}]) assert.equal(validControlRun({...record(),...patch},'RUN','RULE'),false,JSON.stringify(patch));
  for (const id of ['', ' padded', 'x'.repeat(81), 'bad\nID']) assert.throws(()=>parseControlRunId(id));
  assert.equal(parseControlRunId(null),null);assert.equal(parseControlRunId("' OR 1=1 --"),"' OR 1=1 --");
});

function fixture() {
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE evidence_automation_runs(id TEXT PRIMARY KEY,rule_id TEXT,rule_name TEXT,source_name TEXT,status TEXT,score INTEGER,detail TEXT,created_at TEXT,trigger_type TEXT,duration_ms INTEGER,error_code TEXT,evidence_id TEXT,assessment_json TEXT);
    CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT);`);
  const db={prepare(query:string){let values:SQLInputValue[]=[];return {bind(...args:SQLInputValue[]){values=args;return this;},async first(){return sql.prepare(query).get(...values)??null;}};}} as unknown as D1Database;
  const insert=(id:string,assessment:string|null=JSON.stringify(assess()))=>sql.prepare('INSERT INTO evidence_automation_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'RULE','Historical rule','Historical source','pass',100,'Saved result',stamp,'manual',5,null,'E',assessment);
  return {sql,db,insert};
}

test('exact SQL lookup preserves old run snapshots after rule/source removal and never substitutes a prefix or newer run', async () => {
  const {sql,db,insert}=fixture();try {
    insert('RUN');insert('RUN-10');insert("' OR 1=1 --");
    for(let i=0;i<105;i++)insert(`RECENT-${i}`);
    sql.prepare('UPDATE evidence_automation_runs SET created_at=? WHERE id=?').run('2001-01-01T00:00:00.000Z','RUN');
    sql.exec("INSERT INTO simple_grc_records VALUES('E','Kanıtlar')");
    assert.ok(!(sql.prepare('SELECT id FROM evidence_automation_runs ORDER BY created_at DESC LIMIT 100').all()).some(row=>row.id==='RUN'));
    const run=await readControlRun(db,'RUN');assert.equal(run?.id,'RUN');assert.equal(run?.createdAt,'2001-01-01T00:00:00.000Z');assert.equal(run?.ruleName,'Historical rule');assert.equal(run?.evidenceState,'available');
    assert.equal((await readControlRun(db,"' OR 1=1 --"))?.id,"' OR 1=1 --");
    for(const id of ['run','RU','MISSING']) assert.equal(await readControlRun(db,id),null);
    sql.exec("UPDATE simple_grc_records SET module='Risk Assessment' WHERE id='E'");assert.equal((await readControlRun(db,'RUN'))?.evidenceState,'missing');
    sql.exec('DELETE FROM simple_grc_records');assert.equal((await readControlRun(db,'RUN'))?.evidenceState,'missing');
    sql.exec("UPDATE evidence_automation_runs SET evidence_id=NULL,assessment_json=NULL WHERE id='RUN'");const legacy=await readControlRun(db,'RUN');assert.equal(legacy?.evidenceState,'none');assert.equal(legacy?.assessment,null);
  } finally {sql.close();}
});

test('corrupt stored diagnostics are unavailable rather than a successful empty or generic result', async () => {
  const {sql,db,insert}=fixture();try {
    for(const [i,assessment] of ['broken','null','{}',JSON.stringify({...assess(),status:'fail'}),JSON.stringify({...assess(),score:20})].entries()) {insert(String(i),assessment);await assert.rejects(()=>readControlRun(db,String(i)),InvalidStoredControlRun);}
    insert('GOOD');sql.exec("UPDATE evidence_automation_runs SET status='error' WHERE id='GOOD'");await assert.rejects(()=>readControlRun(db,'GOOD'),InvalidStoredControlRun);
    sql.exec('DROP TABLE simple_grc_records');await assert.rejects(()=>readControlRun(db,'GOOD'),/no such table/);
  } finally {sql.close();}
});
