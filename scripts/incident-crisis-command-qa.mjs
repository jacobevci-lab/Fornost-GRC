import assert from 'node:assert/strict';
import {expect} from '@playwright/test';

export async function verifyIncidentCrisisCommands({page,api,admin,open,detail,owner,commanderEmail,reviewer,asset,bia,evidence,base}){
 await detail(page);
 const dossier=page.locator('.incident-dossier');
 await dossier.getByRole('button',{name:'Crisis brief',exact:true}).click();
 await expect(dossier.getByRole('heading',{name:'Crisis team'})).toBeVisible();
 await dossier.getByRole('button',{name:'+ Create improvement finding (CAPA)',exact:true}).click();
 await expect(page.locator('.finding-detail header small').filter({hasText:/FND-\d+/})).toContainText(/FND-\d{3,}/);
 const stamp=new Date(Date.now()-70*3600000).toISOString(),title='QA crisis command '+Date.now();
 const created=await api(admin,'/api/incidents','POST',{action:'create',assignmentMode:'directory',referenceMode:'record-id',requestId:crypto.randomUUID(),title,category:'availability',severity:'critical',detectedAt:stamp,detectedDate:stamp.slice(0,10),description:'The payments service became unavailable during a verified incident.',businessImpact:'Customer transactions and service availability are affected.',owner,commander:commanderEmail,reviewer,assetRefs:asset.id,biaRef:bia.id,dataClassification:'Restricted',personalData:true},201);
 await open(page);await page.getByLabel('Search incidents',{exact:true}).fill(title);await page.locator('.incident-row-open').filter({hasText:title}).click();
 await expect(dossier.locator('.ic-case-head')).toContainText('72 hours');
 await expect(dossier.locator('.ic-case-head').getByRole('button',{name:'Cancel record'})).toBeVisible();
 await dossier.getByRole('button',{name:'Crisis brief',exact:true}).click();
 await expect(dossier.locator('.ic-command')).toContainText('RTO');await expect(dossier.locator('.ic-command')).toContainText('MTPD');
 await dossier.getByRole('button',{name:'Record notification decision',exact:true}).click();
 const notice=page.getByRole('dialog',{name:'Record notification decision',exact:true});
 await notice.getByLabel('Notification decision',{exact:true}).selectOption('required');
 await notice.getByLabel('Applicable law').selectOption('both');await notice.getByLabel('Notification scope assessed').selectOption('authority');
 await notice.getByLabel('Decision rationale').fill('The incident team assessed the affected data and the applicable authority notification requirements.');
 await notice.getByRole('button',{name:'Save',exact:true}).click();await expect(notice).toBeHidden();
 await expect(dossier).toContainText('Supervisory authority');
 await dossier.getByRole('button',{name:'Evidence',exact:true}).click();
 const add=dossier.getByRole('button',{name:'+ Add response evidence',exact:true}),dialog=page.getByRole('dialog',{name:'Add response evidence',exact:true});
 await add.click();const picker=dialog.getByLabel('Evidence record',{exact:true});await expect(picker).toBeEnabled();await picker.selectOption(evidence.evidenceId);
 const version=dialog.getByLabel('File version',{exact:true});await expect(version).toBeEnabled();await version.selectOption(evidence.version1Id);
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).toBeHidden();
 await add.click();await dialog.getByRole('button',{name:'Upload file',exact:true}).click();
 await dialog.locator('input[type=file]').setInputFiles({name:'response-summary.txt',mimeType:'text/plain',buffer:Buffer.from('Verified incident response timeline fixture')});
 const uploaded=page.waitForResponse(r=>r.url()===base+'/api/evidence'&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();const response=await uploaded;assert.equal(response.status(),201,await response.text());await expect(dialog).toBeHidden();
 const history=await api(admin,'/api/incidents?view=history&incidentId='+created.id);
 assert.equal(history.evidencePins.filter(p=>p.purpose==='incident-response').length,2);
 assert.equal(history.events.filter(e=>e.action==='record-notification').length,1);
 await dossier.getByRole('button',{name:'Decision history',exact:true}).click();await expect(dossier).toContainText('Supervisory authority');
}
