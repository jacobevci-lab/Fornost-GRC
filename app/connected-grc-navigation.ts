import type { ConnectedGrcRow } from "./connected-grc-model";

export type ConnectedGrcFilterKey="riskRef"|"findingRef"|"controlRef"|"ruleRef";
export type ConnectedGrcNavigation={module:string;ref:string;filterKey:ConnectedGrcFilterKey};

const value=(input:unknown)=>String(input||"").trim();
const first=(input:unknown)=>Array.isArray(input)?input.map(value).find(Boolean)||"":value(input);
const canonicalRuleRef=(input:unknown)=>first(input).replace(/^RULE:/i,"");

export function connectedGrcNavigation(row:ConnectedGrcRow):ConnectedGrcNavigation|undefined{
 const module=value(row.module),kind=value(row.data?.kind);
 if(!module)return undefined;
 if(module==="Risk Assessment"){
  const ref=value(row.id);return ref&&!ref.startsWith("enterprise:")?{module,ref,filterKey:"riskRef"}:undefined;
 }
 if(module==="Bulgular ve CAPA"){
  if(kind==="remediation")return undefined;
  const ref=value(row.code)||(!value(row.id).startsWith("enterprise:")?value(row.id):"");
  return ref?{module,ref,filterKey:"findingRef"}:undefined;
 }
 if(module==="Kontroller"){
  const ref=value(row.code)||(!value(row.id).startsWith("enterprise:")?value(row.id):"");
  return ref?{module,ref,filterKey:"controlRef"}:undefined;
 }
 if(module==="Kanıt Otomasyonu"){
  let ref="";
  if(kind==="automation-rule")ref=canonicalRuleRef(row.data?.aliasRefs);
  else if(kind.startsWith("automation-"))ref=canonicalRuleRef(row.data?.automationRuleRef);
  else if(!value(row.id).startsWith("enterprise:"))ref=value(row.id)||value(row.code);
  return ref?{module,ref,filterKey:"ruleRef"}:undefined;
 }
 return undefined;
}
