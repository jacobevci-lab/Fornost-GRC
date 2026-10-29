"use client";
import { useId, useState } from 'react';
import { nextReviewMinimum, validReviewDate } from './third-party-risk/review-schedule';
import { validContractExtension, type ContractExtension, type ContractExtensionRecord } from './third-party-risk/contract-extension';
import { useWorkflowRecords } from './use-workflow-records';
import { WorkflowEvidenceHistory } from './workflow-selection-fields';
import type { WorkflowEvidencePin } from './workflow-selection';

export function ThirdPartyContractExtension({value,tr,busy,change}:{value:ContractExtension;tr:boolean;busy:boolean;change:(nextDate:string)=>void}) {
  const id=useId(),tomorrow=nextReviewMinimum(),minimum=validReviewDate(value.previousDate)&&value.previousDate>=tomorrow?nextReviewMinimum(value.previousDate):tomorrow;
  return <fieldset className="workflow-evidence wide" disabled={busy}>
    <legend>{tr?'Gerçekleşen sözleşme uzatımı':'Executed contract extension'}</legend>
    <p>{tr?'İmzalanmış uzatım belgesini kontrol edin ve kanıt olarak seçin. Bu kayıt, inceleme tarihini veya tedarikçi risk kararını değiştirmez.':'Check the executed amendment and select it as evidence. This record preserves the review deadline and supplier risk decision.'}</p>
    <p>{tr?'Mevcut sözleşme bitişi':'Current contract end'}: {value.previousDate}</p>
    <label htmlFor={id}>{tr?'Yeni sözleşme bitişi':'New contract end'}</label>
    <input id={id} type="date" required min={minimum} value={value.nextDate} aria-describedby={`${id}-help`} onChange={event=>change(event.target.value)}/>
    <p id={`${id}-help`}>{tr?'Bugünden ve mevcut sözleşme bitişinden sonraki tarihi seçin.':'Choose a date after today and after the current contract end.'}</p>
    {value.nextDate&&!validContractExtension(value.nextDate,value.previousDate)&&<p role="alert">{tr?'Yeni sözleşme bitişi izin verilen aralıkta değil.':'The new contract end is outside the permitted range.'}</p>}
    <p>{tr?'Kaydedilecek uzatım':'Extension to record'}: <strong>{value.previousDate} → {value.nextDate||'—'}</strong></p>
  </fieldset>;
}

type History={vendorId:string;page:number;rows:{id:string;actor:string;createdAt:string;detail:ContractExtensionRecord|null;pin:WorkflowEvidencePin|null}[];hasMore:boolean};
export function ThirdPartyContractHistory({vendorId,tr}:{vendorId:string;tr:boolean}) {
  const [open,setOpen]=useState(false);
  return <details className="workflow-evidence-history tprm-contract-history" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{tr?'Sözleşme uzatım geçmişi':'Contract extension history'}</summary>
    {open&&<ContractHistoryPage vendorId={vendorId} tr={tr}/>}
  </details>;
}
function ContractHistoryPage({vendorId,tr}:{vendorId:string;tr:boolean}) {
  const [page,setPage]=useState(0),resource=useWorkflowRecords<History>(`/api/third-party-risk?view=contract-history&vendorId=${encodeURIComponent(vendorId)}&page=${page}`,null);
  const data=resource.ready&&resource.data?.vendorId===vendorId&&resource.data.page===page&&Array.isArray(resource.data.rows)?resource.data:null;
  return <>
    <button type="button" disabled={resource.loading} onClick={()=>void resource.reload()}>{tr?'Geçmişi yenile':'Refresh history'}</button>
    {resource.loading?<p role="status">{tr?'Sözleşme geçmişi yükleniyor…':'Loading contract history…'}</p>:!data?<p role="alert">{tr?'Sözleşme geçmişi yüklenemedi. Yenileyerek tekrar deneyin.':'Contract history could not be loaded. Refresh to try again.'}</p>:<>
      {!data.rows.length&&<p>{tr?'Kaydedilmiş sözleşme uzatımı yok.':'No recorded contract extension.'}</p>}
      {data.rows.map(row=><div key={row.id}>
        {row.detail?<><strong>{row.detail.previousDate} → {row.detail.nextDate}</strong><span>{tr?'Kayıt anındaki inceleme tarihi':'Review date at recording'}: {row.detail.reviewDate}</span><span>{row.detail.note}</span></>:<span>{tr?'Bu tarihsel kaydın ayrıntıları okunamadı.':'The details of this historical record could not be read.'}</span>}
        <span>{row.actor}</span><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString(tr?'tr-TR':'en-GB')}</time>
        {row.pin?<WorkflowEvidenceHistory tr={tr} pins={[row.pin]} entityId={vendorId} historical/>:<span>{tr?'Bu kayıt için korunmuş kanıt okunamadı.':'Retained evidence could not be read for this record.'}</span>}
      </div>)}
      <p>{tr?'Sayfa':'Page'} {page+1}</p>
    </>}
    <div className="workflow-choice-pages">{page>0&&<button type="button" disabled={resource.loading} onClick={()=>setPage(page-1)}>{tr?'Önceki 50':'Previous 50'}</button>}{data?.hasMore&&<button type="button" onClick={()=>setPage(page+1)}>{tr?'Sonraki 50':'Next 50'}</button>}</div>
  </>;
}
