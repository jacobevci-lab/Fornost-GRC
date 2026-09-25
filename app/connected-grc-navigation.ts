import type { ConnectedGrcRow } from "./connected-grc-model";

export type ConnectedGrcFilterKey="riskRef"|"findingRef"|"controlRef"|"ruleRef";
export type ConnectedGrcNavigation={module:string;ref:string;filterKey:ConnectedGrcFilterKey};

const value=(input:unknown)=>String(input||"").trim();

export function connectedGrcNavigation(row:ConnectedGrcRow):ConnectedGrcNavigation|undefined{
 const module=value(row.module);
 if(!module)return undefined;
 if(module==="Risk Assessment"){
  const ref=value(row.id);return ref?{module,ref,filterKey:"riskRef"}:undefined;
 }
 if(module==="Bulgular ve CAPA"){
  const ref=value(row.code)||value(row.id);return ref?{module,ref,filterKey:"findingRef"}:undefined;
 }
 if(module==="Kontroller"){
  const ref=value(row.code)||value(row.id);return ref?{module,ref,filterKey:"controlRef"}:undefined;
 }
 if(module==="Kanıt Otomasyonu"){
  const ref=value(row.id)||value(row.code);return ref?{module,ref,filterKey:"ruleRef"}:undefined;
 }
 return undefined;
}
