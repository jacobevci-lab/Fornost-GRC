import {recordCodePrefixes,type RecordCodeModule} from './record-codes';
import {evaluateEvidenceEligibility} from './evidence/eligibility';
import {contextTypes,storedContextType} from './connected-map-context';
import { connectedTitle, connectedRelationLabels, type ConnectedGrcRow as Row, type ConnectedGrcLink as Link } from './connected-grc-model';

export const layers = [
  { tr:'Çerçeve & Politika', en:'Frameworks & policies', modules:['Uyum','Politika Merkezi','Regülasyon Merkezi'] },
  { tr:'Kontrol & Kanıt', en:'Controls & evidence', modules:['Kontroller','Kanıtlar','Kanıt Otomasyonu','Denetim Yönetimi'] },
  { tr:'Risk', en:'Risk', modules:['Risk Assessment','Risk İştahı ve KRI'] },
  { tr:'Varlık, Süreç & Tedarikçi', en:'Assets, processes & vendors', modules:['Varlık Envanteri','BIA','Tedarikçiler','İş Sürekliliği','AI Yönetişimi'] },
  { tr:'Bulgu & Olay', en:'Findings & incidents', modules:['Bulgular ve CAPA','Güvenlik Olayları'] },
];
export const layerOf = (row:Row) => {
  if (/finding|remediation|breach|alert/.test(String(row.data.kind))) return 4;
  const index=layers.findIndex(layer=>layer.modules.includes(row.module));
  return index<0?3:index;
};
export const isShortCode=(value:unknown):value is string=>typeof value==='string' && /^[A-Z]{2,8}-\d{3,}(?:-REM)?$/i.test(value);
const projectionPrefixes:Record<string,string>={
  audit:'AUD',incident:'INC',finding:'FND','finding-manual':'FND',remediation:'CAP',
  policy:'POL','policy-version':'PVR','policy-exception':'PEX',vendor:'VEN','vendor-assessment':'VSA','vendor-finding':'VSF',
  'continuity-plan':'BCP','continuity-exercise':'BCX','continuity-gap':'BCG','risk-appetite':'RAP','risk-scenario':'RSC','kri-measurement':'KRM','kri-breach':'KRB',
  'regulatory-source':'RGS','regulatory-change':'RGC','regulatory-impact':'RGI','automation-source':'CON','automation-rule':'CCR','automation-assurance':'CAS',
  'automation-finding':'CCF','automation-remediation':'CAR','automation-run':'RUN','ai-model':'AIS','ai-finding':'AIF','ai-alert':'AAL',
};
export function mapCode(row:Row){
  const prefix=projectionPrefixes[String(row.data.kind)]||recordCodePrefixes[row.module as RecordCodeModule];
  const nativeId=row.id.startsWith('enterprise:')?row.id.replace(/^enterprise:[^:]+:/,''):row.id;
  // Only identifiers belonging to this record may stand in for the joined registry column.
  const code=[row.code,row.data.recordCode,row.data.record_code,row.data.shortCode,row.data.short_code,nativeId]
    .find(value=>isShortCode(value)&&(!prefix||value.toUpperCase().startsWith(prefix+'-'))&&!value.endsWith('-REM'));
  return typeof code==='string'?code.toUpperCase():'—';
}
export function mapTitle(row:Row,tr:boolean){
  const title=connectedTitle(row);
  return /[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/i.test(title)||title.startsWith('enterprise:')||title===row.id&&!isShortCode(title)?(tr?'Adsız kayıt':'Untitled record'):title;
}
export function mapStats(rows:Row[],links:Link[]) {
  const adjacent=new Map(rows.map(row=>[row.id,new Set<string>()]));
  const degree=new Map(rows.map(row=>[row.id,0]));
  for(const {source,target} of links){
    adjacent.get(source.id)?.add(target.id); adjacent.get(target.id)?.add(source.id);
    degree.set(source.id,(degree.get(source.id)||0)+1); degree.set(target.id,(degree.get(target.id)||0)+1);
  }
  const ranked=[...rows].sort((a,b)=>degree.get(b.id)!-degree.get(a.id)! || mapCode(a).localeCompare(mapCode(b)) || a.id.localeCompare(b.id));
  const linked=ranked.filter(row=>degree.get(row.id)!>0);
  const hubs=ranked.filter(row=>(adjacent.get(row.id)?.size||0)>=3);
  return {ranked,linked,hubs,adjacent,degree,coverage:rows.length?Math.round(100*linked.length/rows.length):null};
}
export function connectedComponent(id:string,adjacent:Map<string,Set<string>>){
  const seen=new Set<string>([id]);for(const node of seen)for(const next of adjacent.get(node)||[])seen.add(next);return seen;
}
export function arrowText(edge:Link,tr:boolean){
  const pair=(a:string,b:string)=>tr?a:b;
  if(edge.field==='mapContext'){const type=storedContextType(edge.relation);return contextTypes[type as keyof typeof contextTypes]?.[tr?0:1]||pair('İlişkilidir','Related to')}
  switch(edge.relation){
    case 'risk-control':return edge.source.module==='Kontroller'?pair('Azaltır','Mitigates'):pair('Azaltan kontrol','Mitigated by');
    case 'control-evidence':return edge.source.module==='Kanıtlar'?pair('Kanıtlar','Evidences'):pair('Kanıtla desteklenir','Supported by');
    case 'risk-asset':return edge.source.module==='BIA'?pair('Bağımlıdır','Depends on'):pair('Etkiler','Affects');
    case 'asset-vendor':return pair('Hizmet alır','Serviced by');
    case 'remediation-risk':return pair('İyileştirir','Remediates');
    default:return connectedRelationLabels[edge.relation]?.[tr?'tr':'en']||edge.relation;
  }
}
export function mergeMapRecords(core:Row[],enterprise:Row[]){
  const merged=new Map(core.map(r=>[r.id,r]));
  for(const row of enterprise){
    const vendor=row.data.kind==='vendor'?merged.get(String(row.data.vendorId)):undefined;
    if(vendor?.module==='Tedarikçiler'){
      merged.set(vendor.id,{...vendor,code:isShortCode(vendor.code)?vendor.code:row.code,data:{...row.data,...vendor.data,aliasRefs:[row.id,row.data.vendorId,...Array.isArray(row.data.aliasRefs)?row.data.aliasRefs:[]]}});continue;
    }
    merged.set(row.id,row);
  }
  return [...merged.values()];
}
export function assuranceCoverage(rows:Row[],links:Link[],now=new Date()){
  const byId=new Map<string,Link[]>();
  for(const edge of links.filter(e=>e.field!=='mapContext'))for(const id of [edge.source.id,edge.target.id]){
    const bucket=byId.get(id)||[];bucket.push(edge);byId.set(id,bucket);
  }
  const portfolios=new Map(rows.filter(r=>r.data.kind==='audit').map(r=>[String(r.data.auditName),r]));
  const activeAudit=(a:Row)=>!a.data.archived&&a.data.closureState!=='closed'&&['aktif','active','in-progress','in_progress','devam ediyor','planlandı','planned','açık','open','hazırlık','hazırlanıyor','başlanmadı','incelemede','in review','yürütülüyor','in progress'].includes(String(a.data.status||'').trim().toLocaleLowerCase('tr'));
  const terminal=new Set(['closed','cancelled','canceled','archived','kapalı','kapatıldı','iptal','arşivlendi']);
  return rows.filter(row=>row.module==='Kontroller'||row.module==='Risk Assessment').map(row=>{
    const evidence=new Map<string,Row>(), audits=new Map<string,Row>(), findings=new Map<string,Row>(),scope=new Map([[row.id,row]]);
    if(row.module==='Risk Assessment')for(const edge of byId.get(row.id)||[]){
      const other=edge.source.id===row.id?edge.target:edge.source;
      if(edge.relation==='risk-control'&&other.module==='Kontroller')scope.set(other.id,other);
    }
    for(const member of scope.values())for(const edge of byId.get(member.id)||[]){
      const other=edge.source.id===member.id?edge.target:edge.source;
      if(other.module==='Kanıtlar'&&edge.relation==='control-evidence')evidence.set(other.id,other);
      if(other.module==='Denetim Yönetimi'){
        const audit=other.data.kind==='audit'?other:portfolios.get(String(other.data.auditName));
        if(audit&&activeAudit(audit))audits.set(audit.id,audit);
      }
      if(other.module==='Bulgular ve CAPA'&&['finding','finding-manual'].includes(String(other.data.kind))&&other.data.status&&!(other.data.status==='accepted'&&String(other.data.acceptUntil||'')>=now.toISOString().slice(0,10))&&!terminal.has(String(other.data.status).toLowerCase()))findings.set(other.id,other);
    }
    const approved=[...evidence.values()].filter(e=>evaluateEvidenceEligibility(e.data,now).current&&String(e.data.reviewStatus).toLowerCase()==='approved'&&!!e.data.reviewedVersion);
    return {row,evidence:[...evidence.values()],approved,audits:[...audits.values()],findings:[...findings.values()]};
  });
}
