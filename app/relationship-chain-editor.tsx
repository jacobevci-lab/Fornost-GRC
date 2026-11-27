"use client";
import {useState} from 'react';
import type {ConnectedGrcRow as Row,ConnectedGrcLink as Link} from './connected-grc-model';
import {canReadModule, type AccessSubject} from './module-access';
import {domainModuleLabel} from './domain-identity';
import {chainLinkChoice} from './relationship-chain-model';
import ConnectedLinkEditor from './connected-grc-link-editor';
export type ChainActor=AccessSubject&{email:string};
export function useChainLinkEditor({rows,links,lang,actor,ready,refresh,openRecord}:{rows:Row[];links:Link[];lang:'tr'|'en';actor?:ChainActor;ready:boolean;refresh:()=>Promise<boolean>;openRecord:(row:Row)=>void}){
  const [editing,setEditing]=useState<{row:Row;key:string}|null>(null);
  const canLink=(row:Row,module:string)=>!!(ready&&actor&&chainLinkChoice(row,module,actor));
  function linkRecord(row:Row,module:string){
    if(!canLink(row,module)||!actor)return;
    const choice=chainLinkChoice(row,module,actor);
    if(choice)setEditing({row,key:choice.key});
  }
  const unavailable=(module:string)=>!ready?(lang==='tr'?'Kayıt bağlantıları doğrulanamadı.':'Record links could not be verified.'):actor&&!canReadModule(actor,module)?(lang==='tr'?'Kayıtlar erişim kapsamı dışında.':'Records are outside your access scope.'):undefined;
  return {actions:{canLink,linkRecord,unavailable},editor:editing&&actor?<ConnectedLinkEditor row={editing.row} rows={rows} links={links} lang={lang} actor={actor}
    initialChoiceKey={editing.key} moduleLabel={module=>domainModuleLabel(module,lang)} refresh={refresh} close={()=>setEditing(null)} openRecord={openRecord}/>:null};
}
