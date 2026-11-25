import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { CORE_RECORD_MODULES } from '../app/core-record-focus';
import { applicationLinkBase, absoluteRecordLink, parseRecordLink, recordLinkFragment, recordLinkNavigation, type RecordLinkTarget } from '../app/record-links';
import { resolveRecordLink } from '../app/record-link-store';
import { notificationRecordTarget } from '../app/notification-record-link';
import { deliverConfiguredEmail } from '../app/api/integrations/email-transport';
const target: RecordLinkTarget = {module:'Denetim Yönetimi',kind:'audit-request',ref:'AR-1',auditId:'AUD-1'};
test('links round-trip exact targets for eight registers and all three audit task types', () => {
 for(const moduleName of CORE_RECORD_MODULES) {
  const input: RecordLinkTarget={module:moduleName,kind:'record',ref:'ID_123'};
  assert.deepEqual(parseRecordLink(recordLinkFragment(input)),input);
 }
 for(const kind of ['audit-request','audit-workpaper','audit-milestone'] as const) {
  const input={...target,kind};assert.deepEqual(parseRecordLink(recordLinkFragment(input)),input);
  assert.deepEqual(recordLinkNavigation(input).filter,{auditId:'AUD-1'});
 }
 for(const suffix of ['&ref=OTHER','&redirect=https://evil.example','&module=Kanıtlar']) assert.equal(parseRecordLink(recordLinkFragment(target)+suffix),null);
 for(const input of [{...target,ref:'../other'},{...target,auditId:''},{...target,module:'Sistem Ayarları'},{...target,kind:'delete'}]) assert.equal(parseRecordLink('#fornost-record?'+new URLSearchParams(input)),null);
 assert.equal(parseRecordLink('#other'),null);
 const vendor:RecordLinkTarget={module:'Tedarikçiler',kind:'record',ref:'vendor-1'};assert.equal(recordLinkNavigation(vendor).kind,'vendor-review');assert.equal(recordLinkNavigation(vendor,true).kind,'record');
});
test('email origins are explicit HTTPS URLs supporting on-prem paths and ports without credentials or redirects', () => {
 assert.equal(applicationLinkBase('https://grc.internal:8443/fornost-grc'),'https://grc.internal:8443/fornost-grc/');
 assert.equal(absoluteRecordLink('https://grc.internal:8443/fornost-grc',target),'https://grc.internal:8443/fornost-grc/'+recordLinkFragment(target));
 for(const input of ['',true,'http://grc.internal','javascript:alert(1)','//evil.test','https://user:secret@grc.test','https://grc.test/?next=evil','https://grc.test/#other','https://grc.test/\npath','https://grc.test/%2fother']) assert.equal(applicationLinkBase(input),null);
});
test('resolver enforces exact module grants and fails uniformly for absent, cross-module and revoked records', async () => {
 const sqlite=new DatabaseSync(':memory:');sqlite.exec("CREATE TABLE simple_grc_records(id TEXT,module TEXT);INSERT INTO simple_grc_records VALUES('ID_123','Kontroller')");
 const db={prepare(sql:string){return {bind(...args:string[]){return {async first(){return sqlite.prepare(sql).get(...args)}}}}}} as unknown as D1Database;
 try {
  const link:RecordLinkTarget={module:'Kontroller',kind:'record',ref:'ID_123'};
  assert.deepEqual(await resolveRecordLink(db,{role:'Viewer',moduleAccess:{mode:'scoped',modules:{Kontroller:'read'}}},link),link);
  assert.equal(await resolveRecordLink(db,{role:'Viewer',moduleAccess:{mode:'scoped',modules:{}}},link),null);
  assert.equal(await resolveRecordLink(db,{role:'Admin'},{...link,module:'Kanıtlar'}),null);
  sqlite.exec('DELETE FROM simple_grc_records');assert.equal(await resolveRecordLink(db,{role:'Admin'},link),null);
 } finally {sqlite.close();}
});
test('notification targets must match the fresh audit request source', () => {
 const item={route:'audit-request',escalation_id:'AR-1',source_json:JSON.stringify({kind:'audit-request',requestId:'AR-1',auditId:'AUD-1'})} as Parameters<typeof notificationRecordTarget>[0];
 assert.deepEqual(notificationRecordTarget(item),target);
 for(const patch of [{route:'other'},{escalation_id:'AR-other'},{source_json:'{'},{source_json:'{}'}]) assert.equal(notificationRecordTarget({...item,...patch}),undefined);
});
test('all email transports append configured task links without sending real mail; absent/invalid configuration remains compatible', async () => {
 const original=globalThis.fetch;const sent:{text:string;message:{body:{content:string}}}[]=[];
 globalThis.fetch=async (_url,init)=>{sent.push(JSON.parse(String(init?.body)));return new Response('{}',{status:200});};
 try {
  for(const provider of ['email-api','smtp-bridge','microsoft-graph-mail']) for(const base of ['https://grc.example.com/fornost-grc/','','http://unsafe.test']) {
   const config={applicationUrl:base,endpoint:'https://mail.example.com/send',bridgeUrl:'https://mail.example.com/send',sender:'sender@example.com'};
   const db={prepare(){return {async first(){return {provider,enabled:1,config_json:JSON.stringify(config),secret_ciphertext:null}}}}} as unknown as D1Database;
   const result=await deliverConfiguredEmail(db,{}, {to:'user@example.com',subject:'Task',text:'x'.repeat(8000),recordLink:target});assert.equal(result.sent,true);
   const message=sent.at(-1)!;const text=provider==='microsoft-graph-mail'?message.message.body.content:message.text;
   assert.ok(text.length<=8000);assert.equal(text.includes('Kaydı aç / Open record:'),Boolean(applicationLinkBase(base)));
   if(base.startsWith('https:')) assert.ok(text.endsWith(absoluteRecordLink(base,target)!));
  }
 } finally {globalThis.fetch=original;}
});
