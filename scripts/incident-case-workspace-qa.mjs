import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function verifyIncidentCaseWorkspace(page) {
  const out = 'incident-connected-evidence-qa-artifacts';
  await mkdir(out,{recursive:true});
  const base = 'http://127.0.0.1:4173';
  const primary = {id:'INC-QA-PRIMARY',code:'INC-2026-A13F702B',title:'Ödeme API’sinde yetkisiz erişim',category:'account-compromise',severity:'critical',detectedDate:'2026-11-09',description:'Ödeme API’sine yetkisiz erişim kaydı inceleniyor.',businessImpact:'Yeni ödeme talepleri beklemede.',owner:'Deniz Kaya',commander:'Ece Aydın',reviewer:'Mert Aksoy',declaredBy:'QA',assetRefs:'Ödeme API’si',biaRef:'Tahsilat süreci',dataClassification:'Restricted',personalData:true,status:'contained',notificationDecision:'pending',reopenCount:0,attention:'recovery-breach',updatedAt:'2026-11-09T09:25:00.000Z'};
  const second={...primary,id:'INC-QA-SECOND',code:'INC-2026-B203E411',title:'Şüpheli e-posta yönlendirmesi',severity:'medium',status:'triage',attention:'triage',businessImpact:'E-posta teslimatı izleniyor.'};
  let records=[], unavailable=false;
  const evidence={id:'qa-file',fileKey:'qa/primary-v1',fileName:'erisim-kaydi.txt',evidenceTitle:'Ağ erişim kaydı',versionNo:1};
  const match=url=>url.pathname==='/api/incidents';
  async function respond(route){
    const url=new URL(route.request().url());
    if(route.request().method()!=='GET')return route.continue();
    if(url.searchParams.get('view')==='history'){
      const id=url.searchParams.get('incidentId'), first=id===primary.id;
      const event={id:'event-'+id,incident_id:id,action:first?'contain':'triage',from_status:first?'triage':'declared',to_status:first?'contained':'triage',actor:first?'Ece Aydın':'Ayşe Polat',created_at:primary.updatedAt,detail:first?'Erişim sınırlandırıldı.':'İleti incelendi.'};
      return route.fulfill({json:{events:[event],evidencePins:first?[{id:'pin-1',entityId:id,eventId:event.id,purpose:'incident-contain',evidence,createdAt:event.created_at,actor:event.actor}]:[],nextCursor:null}});
    }
    if(url.searchParams.has('view'))return route.continue();
    if(unavailable)return route.fulfill({status:503,json:{}});
    return route.fulfill({json:{incidents:records,events:[],limited:false,eventsLimited:false,summary:{total:records.length,active:records.filter(x=>x.status!=='closed').length,critical:records.filter(x=>x.status!=='closed'&&x.severity==='critical').length,breached:records.filter(x=>x.attention==='recovery-breach').length,contained:records.filter(x=>x.status==='contained').length,recovery:0,review:0,personalData:0}}});
  }
  await page.route(match,respond);
  try{
    await page.goto(base);await expect(page.locator('.shell')).toBeVisible({timeout:25000});
    await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
    await page.locator('nav button[aria-label="Security Incidents & Crisis"]').evaluate(el=>el.click());
    const panel=page.locator('.ic-workspace'), dossier=panel.locator('.incident-dossier');
    const refresh=()=>panel.getByRole('button',{name:'Refresh incidents',exact:true}).click();
    await expect(panel.getByRole('heading',{name:'No incidents yet'})).toBeVisible();
    records=[{...second,status:'closed'}];await refresh();
    await panel.getByRole('button',{name:'View closed incidents'}).click();await expect(dossier).toHaveAttribute('data-incident-id',second.id);
    await panel.getByRole('searchbox').fill('missing');await expect(panel.getByRole('heading',{name:'No matching incidents'})).toBeVisible();
    await panel.getByRole('button',{name:'Clear filters'}).click();
    unavailable=true;await refresh();await expect(panel.getByRole('alert')).toBeVisible();
    await expect(panel.locator('.incident-dossier,.ic-shortcuts,.ic-empty h3')).toHaveCount(0);
    unavailable=false;records=[primary,second];await refresh();await expect(dossier).toHaveAttribute('data-incident-id',primary.id);
    await panel.getByRole('button',{name:/^SLA breaches ·/}).click();await expect(panel.locator('.incident-row-open')).toHaveCount(1);
    await expect(dossier.getByRole('link',{name:'Open evidence'})).toHaveAttribute('href',/primary-v1/);
    await dossier.getByRole('button',{name:'Crisis brief',exact:true}).click();
    await expect(dossier).toContainText('Incident contained');
    await expect(dossier).toContainText('Erişim sınırlandırıldı.');await expect(dossier).toContainText('Pending');
    await panel.getByRole('button',{name:/^Active ·/}).click();
    await panel.getByRole('button',{name:/Şüpheli e-posta/}).click();await expect(dossier).toHaveAttribute('data-incident-id',second.id);
    await dossier.getByRole('button',{name:'Evidence',exact:true}).click();
    await expect(dossier).toContainText('No response evidence');await expect(dossier).not.toContainText('Ağ erişim kaydı');
    await dossier.getByRole('button',{name:'Decision history',exact:true}).click();await expect(dossier).toContainText('İleti incelendi.');
    await panel.getByRole('button',{name:/Ödeme API’sinde/}).click();
    for (const lang of ['TR','EN']) {
      await page.setViewportSize({width:1440,height:960});
      await page.locator('.language-switch:visible').getByRole('button',{name:lang,exact:true}).click();
      for (const theme of ['light','dark']) {
        await page.setViewportSize({width:1440,height:960});
        if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle:visible').click();
        for (const width of [1440,390]) {
          await page.setViewportSize({width,height:960});
          await expect(dossier.getByRole('link',{name:lang==='TR'?'Kanıtı aç':'Open evidence'})).toBeVisible();
          assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+2));
          await page.evaluate(async()=>{
            await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
            const transitions=document.getAnimations().filter(a=>a instanceof CSSTransition);
            await Promise.allSettled(transitions.map(a=>a.finished));
          });
          const results=await new AxeBuilder({page}).include('.ic-workspace').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
          assert.deepEqual(results.violations.map(v=>[v.id,v.nodes.map(n=>[n.target,n.failureSummary])]),[],lang+" "+theme+" "+width);
          if(lang==='TR'&&theme==='light')await panel.screenshot({path:out+'/case-'+width+'.png'});
        }
      }
    }
  }finally{await page.unroute(match,respond);}
}
