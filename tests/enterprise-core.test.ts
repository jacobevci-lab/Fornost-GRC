import {strict as assert} from 'node:assert';
import test from 'node:test';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {annualLossMinor,exposure,readEstimate,money} from '../app/enterprise/fair';
import {ensureEnterprise,enterpriseSchema} from '../app/enterprise/schema';
import {resolveScope,visibleEntities,scopeRoute} from '../app/enterprise/scope';
import {listRecords,updateRecord,kinds} from '../app/enterprise/register';
import {directory,previewUser,scimUser,scimEnterprise,tokenValid,writeDirectory} from '../app/enterprise/directory';
import {validSaml} from '../app/enterprise/metadata';
import type {Actor} from '../app/api/auth/security';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 function prepare(query:string,binds:SQLInputValue[]=[]){
  const execute=()=>({results:sql.prepare(query).all(...binds),meta:{changes:sql.prepare('SELECT changes() n').get()!.n}});
  return {bind:(...v:SQLInputValue[])=>prepare(query,v),execute,all:async()=>execute(),first:async()=>sql.prepare(query).get(...binds)};
 }
 const db={prepare,batch:async(stmts:ReturnType<typeof prepare>[])=>{sql.exec('BEGIN');try{const result=stmts.map(s=>s.execute());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}} as unknown as D1Database;
 return {sql,db};
}
const admin:Actor={id:'admin',role:'Admin',email:'admin@example.test',name:'Admin',source:'local'};
const user:Actor={id:'editor',role:'Editor',email:'editor@example.test',name:'Editor',source:'local'};
test('migration and runtime schema match; unfinished installations retain the root scope',async()=>{
 const {db}=fixture();assert.equal(enterpriseSchema.trim(),readFileSync('drizzle/0118_enterprise_core.sql','utf8').trim());
 assert.equal((await resolveScope(db,user)).restricted,false);
});
test('descendant grants, sibling isolation, native financial writes, stale updates and module intersections',async()=>{
 const {sql,db}=fixture();await ensureEnterprise(db);
 sql.exec(`INSERT INTO org_entities VALUES('a','root','company','A'),('b','root','company','B'),('aa','a','unit','AA');
 CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,updated_at TEXT);
 CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,code TEXT);
 INSERT INTO simple_grc_records VALUES('r','Risk Assessment','{"title":"Test","status":"Açık"}','old');
 INSERT INTO simple_grc_record_codes VALUES('r','RSK-001')`);
 const group={...admin,orgScope:await resolveScope(db,admin)};
 const none={...user,orgScope:await resolveScope(db,user)};
 assert.equal(none.orgScope.restricted,true);
 assert.deepEqual((await listRecords(db,none,'risk',0)).rows,[]);
 sql.exec("INSERT INTO org_user_roles VALUES('editor','contributor','1');INSERT INTO org_memberships VALUES('editor','a')");
 const actor={...user,orgScope:await resolveScope(db,user)};
 assert.deepEqual((await visibleEntities(db,actor)).map(e=>e.id),['a','aa']);
 assert.equal(scopeRoute(actor.orgScope,'/api/grc','GET'),false);
 assert.equal(scopeRoute(actor.orgScope,'/api/integrations','POST'),false);
 assert.equal((await listRecords(db,group,'risk',0)).rows[0].org_entity_id,'root');
 const base={kind:'risk',id:'r',entity:'aa',note:'Scoped note',revision:''};
 await updateRecord(db,group,base);
 const row=(await listRecords(db,actor,'risk',0)).rows[0];assert.equal(row.code,'RSK-001');
 await assert.rejects(updateRecord(db,actor,{...base,revision:row.revision,entity:'b'}));
 const fairLite={currency:'TRY',frequency:50,minimum:10,likely:20,maximum:30};
 await updateRecord(db,actor,{...base,revision:row.revision,fairLite,previousEstimate:null,fieldEdit:{source:'simple_grc_records',field:'description',previous:'',value:'Scoped native update'}});
 assert.equal(JSON.parse(String(sql.prepare('SELECT data_json FROM simple_grc_records').get()!.data_json)).description,'Scoped native update');
 assert.deepEqual(JSON.parse(String(sql.prepare('SELECT data_json FROM simple_grc_records').get()!.data_json)).fairLite,fairLite);
 await assert.rejects(updateRecord(db,actor,{...base,revision:row.revision}));
 const sibling={...actor,orgScope:await resolveScope(db,user,'b')};
 assert.deepEqual((await listRecords(db,sibling,'risk',0)).rows,[]);
 await assert.rejects(updateRecord(db,sibling,{...base,revision:(await listRecords(db,actor,'risk',0)).rows[0].revision}));
 await assert.rejects(listRecords(db,{...actor,moduleAccess:{mode:'scoped',modules:{}}},'risk',0));
 sql.exec("DELETE FROM org_memberships WHERE user_id='editor'");
 assert.equal((await listRecords(db,actor,'risk',0)).rows.length,0);
 assert.equal(Object.keys(kinds).length,11);
});
test('token rotation, replay conflict, department/group simulation, revocation and no local account mutations',async()=>{
 const {sql,db}=fixture();await ensureEnterprise(db);
 const rule={attribute:'department',value:'Legal',role:'contributor',entity:'root'};
 await writeDirectory(db,admin.email,{action:'rules',revision:'',rules:[rule]});
 await assert.rejects(writeDirectory(db,admin.email,{action:'rules',revision:'',rules:[]}));
 const old=(await writeDirectory(db,admin.email,{action:'rotate',revision:''})).token!;
 assert.equal(await tokenValid(db,'Bearer '+old),true);
 const dir=await directory(db); const fresh=(await writeDirectory(db,admin.email,{action:'rotate',revision:dir.tokenRevision})).token!;
 assert.equal(await tokenValid(db,'Bearer '+old),false);assert.equal(await tokenValid(db,'Bearer '+fresh),true);
 assert.equal(JSON.stringify(await directory(db)).includes(fresh),false);
 const person={schemas:[scimUser,scimEnterprise],userName:'qa@example.test',groups:[{value:'owners'}],[scimEnterprise]:{department:'LEGAL'}};
 assert.deepEqual(previewUser(person,dir.rules),{simulation:true,result:'matched',role:'contributor',entities:['root']});
 assert.equal(previewUser(person,[...dir.rules,{attribute:'group',value:'owners',role:'entity-manager',entity:'root'}]).result,'conflict');
 assert.equal(previewUser({...person,active:false},dir.rules).result,'unmapped');
 assert.equal(sql.prepare('SELECT count(*) n FROM org_user_roles').get()!.n,0);
 await assert.rejects(writeDirectory(db,admin.email,{action:'rules',revision:dir.revision,rules:[{...rule,entity:'unknown'}]}));
 await writeDirectory(db,admin.email,{action:'revoke',revision:(await directory(db)).tokenRevision});
 assert.equal(await tokenValid(db,'Bearer '+fresh),false);
});
test('FAIR PERT expectancy, numeric bounds and separate currency totals',()=>{
 const raw={currency:'TRY',frequency:25,minimum:100,likely:200,maximum:600},e=readEstimate(raw)!;
 assert.equal(annualLossMinor(e),BigInt(6250));
 for(const patch of [{frequency:101},{frequency:-1},{currency:'CAD'},{likely:601},{minimum:201},{maximum:'NaN'},{frequency:''}])assert.equal(readEstimate({...raw,...patch}),null);
 const result=exposure([{data:{fairLite:e}},{data:{}},{data:{fairLite:{...e,currency:'EUR',frequency:1}}}]);
 assert.equal(result.measured,2);assert.deepEqual([...result.totals],[['TRY',BigInt(6250)],['EUR',BigInt(250)]]);assert.match(money(BigInt(6250),'EUR',true),/62,50/);
});
test('SAML preflight requires actual IdP services and namespace',()=>{
 const xml='<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="provider"><IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><SingleSignOnService Location="https://example.org/sso"/></IDPSSODescriptor></EntityDescriptor>';
 assert.equal(validSaml(xml),true);assert.equal(validSaml('<example>EntityDescriptor</example>'),false);assert.equal(validSaml(xml.replace('https:','http:')),false);
});
