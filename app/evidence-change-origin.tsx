'use client';
import {navigateToFornost} from './navigation-focus';
import type {EvidenceChangeOrigin} from './evidence/change-followups';

export function EvidenceChangeOriginView({origin,tr}:{origin?:EvidenceChangeOrigin;tr:boolean}){
  if(!origin)return null;
  const t=(a:string,b:string)=>tr?a:b;
  return <section className="ecf-origin" aria-label={t('Kanıt değişikliği kaynağı','Evidence change origin')}>
    <h4>{t('Kanıt değişikliği incelemesi','Evidence change review')}</h4>
    <p>{origin.evidence.code} · {origin.evidence.title} · v{origin.evidence.versionNo}</p>
    <p>{origin.source.kind==='requests'?t('Kanıt talebi','Evidence request'):t('Çalışma kâğıdı','Workpaper')}: {origin.source.title}</p>
    <p>{t('Oluşturma anında sabitlenen sürümler','Versions pinned when this task was created')}: {origin.source.pins.map(p=>`v${p.versionNo||'?'} (${p.state==='older'?t('önceki','earlier'):p.state==='unknown'?t('doğrulanamadı','unverified'):t('güncel','current')})`).join(', ')}</p>
    <p>{origin.reason}</p><small>{origin.createdBy} · {origin.createdAt}</small>
    <p>{t('Görevin tamamlanması kaynak işin kanıtını değiştirmez veya onaylamaz. Yeniden sunma ve onay kararı kaynak işte verilir.','Completing this task does not replace or approve evidence in the source work. Resubmission and approval remain in the source workflow.')}</p>
    <div className="ecf-actions"><button type="button" onClick={()=>navigateToFornost({module:'Kanıtlar',kind:'record',ref:origin.evidence.id,source:'evidence-change-task'})}>{t('Kaynak kanıtı aç','Open source evidence')}</button><button type="button" onClick={()=>navigateToFornost({module:'Denetim Yönetimi',kind:origin.source.kind==='requests'?'audit-request':'audit-workpaper',ref:origin.source.id,filter:{auditId:origin.source.auditId},source:'evidence-change-task'})}>{t('Kaynak işi aç','Open source work')}</button></div>
    <details><summary>{t('Sürüm ve kaynak kimlikleri','Version and source identities')}</summary><p>{t('Yeni kanıt sürümü','New evidence version')}: <code>{origin.evidence.versionId}</code></p><p>SHA-256: <code>{origin.evidence.contentSha256}</code></p><p>{t('Kaynak iş sürümü','Source work revision')}: <code>{origin.source.revision}</code></p><ul>{origin.source.pins.map((pin,i)=><li key={i}>v{pin.versionNo||'?'} · <code>{pin.id||'—'}</code></li>)}</ul></details>
  </section>;
}
