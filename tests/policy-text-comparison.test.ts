import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePolicyText} from '../app/policy-lifecycle/text-comparison';
test('highlights independent edits while preserving both exact texts including Turkish letters and whitespace',()=>{
 const a='İncele: 90 gün.\nSahibi aynı. Yılda bir denetle.',b='İncele: 30 gün.\nSahibi aynı. Ayda bir denetle.';
 const diff=comparePolicyText(a,b);
 assert.equal(diff.before.map(p=>p.text).join(''),a);assert.equal(diff.after.map(p=>p.text).join(''),b);
 assert.deepEqual(diff.after.filter(p=>p.changed).map(p=>p.text),['30','Ayda']);
 assert.ok(comparePolicyText(a,a).after.every(p=>!p.changed));assert.equal(comparePolicyText('',b).after[0].changed,true);
 const left='a '.repeat(2000),right='b '.repeat(2000);const large=comparePolicyText(left,right);assert.equal(large.highlighted,false);assert.equal(large.after[0].text,right);
});
