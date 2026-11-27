import { domainStatusKey, domainStatusLabel } from './domain-identity';
import { displayRecordCode } from './record-codes';
import { canReadModule, scopedApiAllowed, type AccessSubject } from './module-access';
import { linkChoices } from './connected-map-links';
import type { ConnectedGrcRow as Row, ConnectedGrcLink as Link } from './connected-grc-model';

export const chainModules = { risk:'Risk Assessment', control:'Kontroller', evidence:'Kanıtlar' } as const;
export function relationshipStatus(row:Row, lang:'tr'|'en', now=Date.now()) {
  const tr=lang==='tr', raw=String(row.data.status||'').trim();
  let key:string|null=domainStatusKey(raw), label=domainStatusLabel(raw,lang);
  const normalized=raw.normalize('NFKC').toLocaleLowerCase('tr').replaceAll('ı','i').replace(/[ _]+/g,'-');
  const extra:Record<string,[string,string,string]>={
    'reddedildi':['rejected','Reddedildi','Rejected'],'rejected':['rejected','Reddedildi','Rejected'],
    'bakimda':['maintenance','Bakımda','Maintenance'],'maintenance':['maintenance','Bakımda','Maintenance'],
    'planlanan':['planned','Planlandı','Planned'],'archived':['archived','Arşivlendi','Archived'],'arşivlendi':['archived','Arşivlendi','Archived'],
    'cancelled':['cancelled','İptal Edildi','Cancelled'],'retired':['retired','Yürürlükten Kaldırıldı','Retired'],
    'eol':['eol','Ömrünü Tamamladı','End of Life'],'uygulaniyor':['implementing','Uygulanıyor','Implemented'],'implemented':['implementing','Uygulanıyor','Implemented'],
    'izleniyor':['monitoring','İzleniyor','Monitoring'],'monitoring':['monitoring','İzleniyor','Monitoring'],
    'önlem-aliniyor':['treating','Önlem Alınıyor','Under Treatment'],'under-treatment':['treating','Önlem Alınıyor','Under Treatment'],
  };
  if(extra[normalized]){const value=extra[normalized];key=value[0];label=value[tr?1:2];}
  if (['in-review','pending-review','incelemede','onay-bekliyor','onay-bekleyen','pending-approval','review','submitted'].includes(normalized)) { key='under-review';label=tr?'İncelemede':'In Review'; }
  const effective=['effective','etkin','verified','doğrulandı'].includes(normalized);
  if(effective){key='active';label=tr?(normalized==='verified'||normalized==='doğrulandı'?'Doğrulandı':'Etkin'):(normalized==='verified'||normalized==='doğrulandı'?'Verified':'Effective');}
  if (row.module===chainModules.evidence) {
    const expiry=Date.parse(String(row.data.expiresAt||''));
    if (Number.isFinite(expiry) && expiry + (String(row.data.expiresAt).length===10?86400000:0) <= now) { key='expired';label=tr?'Süresi Doldu':'Expired'; }
    else if (row.data.pendingVersion) { key='under-review';label=tr?'İncelemede':'In Review'; }
  }
  const tone=key && ['active','approved'].includes(key)?'positive':key && ['under-review','verification','expired','overdue','rejected'].includes(key)?'warning':'neutral';
  return {label:label||(tr?'Durum belirtilmedi':'Status not set'),tone};
}
export function chainNeighbours(row:Row|undefined, links:Link[], relation:string, module:string) {
  const found=new Map<string,Row>();
  if(row)for(const link of links){
    if(link.relation!==relation)continue;
    const other=link.source.id===row.id?link.target:link.target.id===row.id?link.source:undefined;
    if(other?.module===module)found.set(other.id,other);
  }
  return [...found.values()].sort((a,b)=>displayRecordCode(a).localeCompare(displayRecordCode(b)));
}
export type AssuranceBranch={row?:Row;module:string;children:AssuranceBranch[];source?:Row};
/** Keep complete paths rooted in the inspected record; never join unrelated siblings. */
export function assuranceBranches(anchor:Row,links:Link[]):AssuranceBranch[]{
  const {risk,control,evidence}=chainModules;
  const controls=anchor.module===control?[anchor]:chainNeighbours(anchor,links,anchor.module===risk?'risk-control':'control-evidence',control);
  const controlBranch=(row?:Row,source?:Row):AssuranceBranch=>({row,module:control,source,children:
    (anchor.module===evidence?[anchor]:chainNeighbours(row,links,'control-evidence',evidence)).map(doc=>({row:doc,module:evidence,children:[]}))
  });
  const withEvidenceGap=(branch:AssuranceBranch)=>{if(branch.row&&!branch.children.length)branch.children=[{module:evidence,children:[],source:branch.row}];return branch;};
  if(anchor.module===risk)return [{row:anchor,module:risk,children:controls.length?controls.map(c=>withEvidenceGap(controlBranch(c))):[{module:control,children:[],source:anchor}]}];
  const roots=new Map<string,AssuranceBranch>();
  for(const ctl of controls){
    const risks=chainNeighbours(ctl,links,'risk-control',risk);
    for(const r of risks.length?risks:[undefined]){
      const key=r?.id||'missing:'+ctl.id;
      const root=roots.get(key)||{row:r,module:risk,source:ctl,children:[]};
      root.children.push(withEvidenceGap(controlBranch(ctl)));roots.set(key,root);
    }
  }
  return roots.size?[...roots.values()]:[{module:risk,children:[{module:control,source:anchor,children:[{row:anchor,module:evidence,children:[]}]}]}];
}
/** Only functional relationships used by the chains, not generic map annotations. */
export function chainLinkChoice(source:Row,targetModule:string,actor:AccessSubject) {
  if(!scopedApiAllowed(actor,'/api/connected-grc/links','POST'))return;
  if(source.data.kind==='continuity-plan'&&(source.data.status!=='draft'||actor.role!=='Admin'&&source.data.owner!==(actor as AccessSubject&{email?:string}).email))return;
  if(!canReadModule(actor,source.module)||!canReadModule(actor,targetModule))return;
  const choices=linkChoices(source,actor).filter(c=>c.module===targetModule&&!c.field.startsWith('context-'));
  return choices.find(c=>!c.reverse)||choices[0];
}
