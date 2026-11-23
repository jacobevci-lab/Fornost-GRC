import assert from 'node:assert/strict';
import {qaPassword} from './qa-credentials.mjs';
export const reviewerEmail='qa-automation-review@fornost.test';
export async function registerQaReviewer(client){
  const base='http://127.0.0.1:4173';
  const response=await client.post(base+'/api/users',{headers:{origin:base},data:{
    name:'QA Evidence Reviewer',email:reviewerEmail,role:'Editor',password:qaPassword(),
  }});
  if(response.status()!==201){
    const users=await (await client.get(base+'/api/users')).json();
    assert.ok((users.users||users).some(u=>u.email===reviewerEmail&&u.role==='Editor'&&u.status==='Active'),'Independent QA reviewer is available');
  }
}
export async function chooseQaReviewer(form,email=reviewerEmail){
  const box=form.getByRole('combobox',{name:/Kanıt İnceleyeni \(SoD\)|Evidence reviewer \(SoD\)/i});
  await box.fill(email);await form.getByRole('option',{name:new RegExp(email.replaceAll('.','\\.'))}).click();
}
