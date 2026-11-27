"use client";
import type { ConnectedGrcLink as Link, ConnectedGrcRow as Row } from './connected-grc-model';
import { domainModuleLabel } from './domain-identity';
import { assuranceBranches, chainModules, type AssuranceBranch } from './relationship-chain-model';
import { RelationshipCard, RelationshipList, MissingRelationship, type ChainLinkActions } from './relationship-chain-card';
export const hasAssuranceChain=(row:Row)=>Object.values(chainModules).includes(row.module as typeof chainModules[keyof typeof chainModules]);

export function AssuranceChain({anchor,links,lang,openRecord,canLink,linkRecord,unavailable}: {
  anchor:Row;links:Link[];lang:'tr'|'en';openRecord:(row:Row)=>void;inspector?:boolean;trail?:string[];
}&ChainLinkActions){
  const tr=lang==='tr';
  function branches(items:AssuranceBranch[],depth:number,path:string){
    return <RelationshipList key={path} items={items} tr={tr} label={domainModuleLabel(items[0]?.module,lang)} render={(item,index)=><li key={item.row?.id||'missing-'+index} data-stage={depth} data-present={!!item.row} data-connected={depth>0&&item.row?'yes':'no'}>
      <small className="relationship-tree-label">{domainModuleLabel(item.module,lang)}</small>
      {item.row?<RelationshipCard row={item.row} anchor={anchor} lang={lang} openRecord={openRecord}/>:<MissingRelationship source={item.source} module={item.module} tr={tr} message={unavailable?.(item.module)} canLink={canLink} linkRecord={linkRecord}/>}
      {!!item.children.length&&<div className="relationship-tree-children">{branches(item.children,depth+1,path+'/'+(item.row?.id||index))}</div>}
    </li>}/>;
  }
  return <section className="relationship-tree" aria-label={tr?'Risk – Kontrol – Kanıt İlişkisi':'Risk – Control – Evidence'}>
    <h4>{tr?'Risk – Kontrol – Kanıt İlişkisi':'Risk – Control – Evidence'}</h4>
    {branches(assuranceBranches(anchor,links),0,anchor.id)}
  </section>;
}
