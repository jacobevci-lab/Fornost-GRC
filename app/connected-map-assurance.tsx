"use client";
import {useMemo,useState} from 'react';
import type {ConnectedGrcRow as Row,ConnectedGrcLink as Link} from './connected-grc-model';
import {assuranceCoverage,mapCode,mapTitle} from './connected-map-model';

export default function MapAssurance({rows,links,tr,complete,openRecord,go,exportReport,openWork}:{openWork:()=>void;exportReport:()=>void;rows:Row[];links:Link[];tr:boolean;complete:boolean;openRecord:(r:Row)=>void;go:(m:string)=>void}){
  const all=useMemo(()=>assuranceCoverage(rows,links),[rows,links]),[scope,setScope]=useState('all'),[page,setPage]=useState(0);
  const t=(a:string,b:string)=>tr?a:b;
  const names={approved:t('Onaylı kanıtlı','Approved evidence'),missing:t('Kanıt eksik / bayat','Missing / stale evidence'),audit:t('Aktif denetimde','In active audit'),capa:t('Açık CAPA var','Open CAPA')};
  const flags=(x:typeof all[number])=>[x.approved.length?'approved':complete?'missing':'unknown',...(x.audits.length?['audit']:[]),...(x.findings.length?['capa']:[])];
  const filtered=all.filter(x=>scope==='all'||flags(x).includes(scope)),current=Math.min(page,Math.max(0,Math.ceil(filtered.length/25)-1));
  const ref=(r:Row)=><button className="cm-record-link" type="button" key={r.id} onClick={()=>openRecord(r)}>{mapCode(r)} · {mapTitle(r,tr)}</button>;
  return <section className="cgw cm-assurance"><header><div><h3>{t('Güvence ve Kanıt Kapsamı','Assurance and evidence coverage')}</h3></div><div><button onClick={()=>go('Kanıtlar')}>{t('Kanıt Kütüphanesi','Evidence Library')}</button> <button onClick={()=>go('Denetim Yönetimi')}>{t('Denetim Yönetimi','Audit Management')}</button> <button onClick={openWork}>{t('Güvence işlerini aç','Open assurance work')}</button> <button className="cg-assurance-export" disabled={!complete} onClick={exportReport}>{t('Güvence raporu (CSV)','Assurance report (CSV)')}</button></div></header>
    <label>{t('Güvence durumu','Assurance status')} <select value={scope} onChange={e=>{setScope(e.target.value);setPage(0)}}><option value="all">{t('Tümü','All')}</option>{Object.entries(names).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
    <div className="cgw-table-scroll"><table><thead><tr>{[t('Kontrol / Risk','Control / Risk'),t('Güvence durumu','Assurance status'),t('Kanıtlar','Evidence'),t('Aktif denetimler','Active audits'),t('Açık bulgular','Open findings')].map(n=><th key={n}>{n}</th>)}</tr></thead><tbody>{filtered.slice(current*25,(current+1)*25).map(x=><tr key={x.row.id}><th scope="row">{ref(x.row)}</th><td>{flags(x).map(key=><span className="cm-status" key={key}>{names[key as keyof typeof names]||t('Kaynaklar eksik','Partial sources')}</span>)}</td><td>{x.evidence.length?x.evidence.map(ref):'—'}</td><td>{x.audits.length?x.audits.map(ref):'—'}</td><td>{x.findings.length?x.findings.map(ref):'—'}</td></tr>)}</tbody></table></div>
    {!filtered.length&&<p>{t('Bu kapsamda kontrol veya risk bulunamadı.','No controls or risks in this scope.')}</p>}
    {filtered.length>25&&<div><button disabled={!current} onClick={()=>setPage(current-1)}>{t('Önceki','Previous')}</button> {current+1} / {Math.ceil(filtered.length/25)} <button disabled={(current+1)*25>=filtered.length} onClick={()=>setPage(current+1)}>{t('Sonraki','Next')}</button></div>}
  </section>;
}
