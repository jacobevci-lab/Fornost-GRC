// Fictional exercise. Nothing here asserts a real Microsoft assurance or incident.
export const title = {
  vendor: 'Microsoft Corporation (Entra ID / M365)', asset: 'Microsoft Entra ID (Azure AD) Tenant',
  bia: 'Kurumsal Kimlik ve Erişim Yönetimi (IAM / SSO)', plan: 'Entra ID Break-Glass ve Kimlik Kurtarma Planı',
  control: 'Entra ID Global Admin Hesaplarında Phishing-Resistant MFA (FIDO2) ve PIM Zorunluluğu',
  evidence: 'Entra ID Conditional Access ve PIM Politika Çıktısı', policy: 'Ayrıcalıklı Erişim ve Kimlik Yönetimi Politikası',
  risk: 'Entra ID Global Admin Hesap Ele Geçirme ve Yetki Yükseltme Riski',
  kri: 'PIM veya FIDO2 MFA Koruması Olmayan Global Admin Hesap Sayısı',
  ai: 'Microsoft Security Copilot — Entra ID Kimlik Analiz Asistanı',
  incident: 'Entra ID Break-Glass Admin Hesabında Olağandışı Oturum Açma Girişimi',
  finding: '2 Eski Global Admin Hesabında PIM Süre Sınırı Eksikliği',
};
export const note='Fornost E2E · Entra IAM · sentetik tatbikat';
export const date=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
export const sources=[
  ['/api/grc','rows'],['/api/third-party-risk','vendors'],['/api/risk-appetite','appetites'],
  ['/api/continuity','plans'],['/api/continuity','exercises'],['/api/continuity','gaps'],
  ['/api/audits','audits'],['/api/findings?view=graph','findings'],['/api/incidents','incidents'],
  ['/api/policy-lifecycle','documents'],['/api/policy-lifecycle','versions'],['/api/policy-lifecycle','exceptions'],
  ['/api/policy-lifecycle','campaigns'],['/api/regulatory-intelligence','sources'],['/api/regulatory-intelligence','changes'],
  ['/api/regulatory-intelligence','impacts'],['/api/ai/workspace','systems'],['/api/ai/workspace','shadow'],
];
export async function inventory(api) {
  const pages=new Map(), rows=[];
  for(const [path,key] of sources){
    if(!pages.has(path)) pages.set(path,await api(path));
    const data=pages.get(path);
    if(!Array.isArray(data[key])) throw Error('Missing inventory collection '+path+' / '+key);
    if(data.nextCursor || data.hasMore)throw Error('Incomplete inventory '+path);
    for(const raw of data[key]){
      const content=raw.data_json?JSON.parse(raw.data_json):raw;
      const name=content.title||content.name||content.process||content.kriName||content.evidenceTitle||content.controlTitle||content.auditName||content.systemName||content.sourceTitle||'';
      if(name)rows.push({key,path,id:raw.id||raw.vendorId,name,module:raw.module,owner:content.owner,revision:raw.updated_at});
    }
  }
  return rows;
}
export async function clean(api,report,apply){
  const before=await inventory(api);
  // Word matches alone cannot establish that a real audit assessment is disposable.
  const candidates=before.filter(r=>/^QA-CLOUD-|^(?:test|Assessment \d+)$/i.test(r.name));
  report.cleanup={inspected:before.length,candidates:candidates.length,deleted:[],retained:[]};
  for(const r of candidates){
    const label={module:r.module||r.key,title:r.name};
    if(!apply||!/^QA-CLOUD-/i.test(r.name)||r.key!=='rows'){
      report.cleanup.retained.push({...label,reason:!apply?'inventory-only':r.key==='rows'?'ambiguous ownership':'module lifecycle review required'});continue;
    }
    const current=(await api('/api/grc')).rows.find(x=>x.id===r.id);
    if(!current||current.updated_at!==r.revision){report.cleanup.retained.push({...label,reason:'record changed'});continue;}
    const result=await api('/api/grc?id='+encodeURIComponent(r.id)+'&expectedUpdatedAt='+encodeURIComponent(r.revision),{method:'DELETE',expected:[200,409]});
    if(result.code)report.cleanup.retained.push({...label,reason:result.code});
    else if((await api('/api/grc')).rows.some(x=>x.id===r.id))throw Error('Deletion did not remove owned record');
    else report.cleanup.deleted.push(label);
  }
  return before;
}
