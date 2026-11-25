import test from 'node:test';
import assert from 'node:assert/strict';
import { exportAuditCalendar, importAuditCalendar, CALENDAR_TEMPLATE_BYTES } from '../app/audit-calendar-template';
const calendar = {mode:'business' as const,weekdays:[5,1,2,3,4],holidays:['2026-10-29','2026-01-01']};
test('calendar transfer normalizes dates and weekdays without changing the input',()=>{
 const original=structuredClone(calendar),text=exportAuditCalendar(calendar);
 assert.deepEqual(importAuditCalendar('\uFEFF'+text),{mode:'business',weekdays:[1,2,3,4,5],holidays:['2026-01-01','2026-10-29']});
 assert.deepEqual(calendar,original);
 assert.deepEqual(Object.keys(JSON.parse(text).calendar).sort(),['holidays','mode','weekdays']);
 assert.deepEqual(importAuditCalendar(exportAuditCalendar({mode:'calendar',weekdays:[0],holidays:[]})),{mode:'calendar',weekdays:[0],holidays:[]});
});
test('calendar transfer rejects unsupported formats, hidden settings and oversized input',()=>{
 const envelope=JSON.parse(exportAuditCalendar(calendar));
 for(const bad of [null,[],{}, {...envelope,version:2},{...envelope,format:'other'},{...envelope,auditId:'a'},{...envelope,calendar:{...calendar,escalationRecipient:'person@example.com'}},{...envelope,calendar:{...calendar,beforeDays:1}}])assert.throws(()=>importAuditCalendar(JSON.stringify(bad)));
 assert.throws(()=>importAuditCalendar('{'));
 assert.throws(()=>importAuditCalendar(' '.repeat(CALENDAR_TEMPLATE_BYTES)+'{}'),/size/);
 assert.throws(()=>importAuditCalendar('ş'.repeat(CALENDAR_TEMPLATE_BYTES/2+1)),/size/);
});
test('calendar transfer rejects invalid or repeated dates and weekdays before applying anything',()=>{
 for(const patch of [{mode:'other'},{weekdays:[]},{weekdays:[1,1]},{weekdays:[7]},{weekdays:['1']},{holidays:['2026-02-30']},{holidays:['2026-10-29','2026-10-29']},{holidays:Array(367).fill('2026-01-01')},{holidays:null}]){
  assert.throws(()=>exportAuditCalendar({...calendar,...patch} as typeof calendar));
  assert.throws(()=>importAuditCalendar(JSON.stringify({format:'fornost-audit-calendar',version:1,calendar:{...calendar,...patch}})));
 }
});
