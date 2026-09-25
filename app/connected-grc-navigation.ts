import type { ConnectedGrcRow } from "./connected-grc-model";

export type ConnectedGrcFilterKey="riskRef"|"findingRef"|"controlRef"|"ruleRef";
export type ConnectedGrcNavigation={module:string;ref:string;filterKey:ConnectedGrcFilterKey};

const value=(input:unknown)=>String(input||"").trim();
const first=(input:unknown)=>Array.isArray(input)?input.map(value).find(Boolean)||"":value(input);
const canonicalRuleRef=(input:unknown)=>first(input).replace(/^RULE:/i,"");

export function connectedGrcNavigation(row:ConnectedGrcRow):ConnectedGrcNavigation|undefined{
 const targetModule=value(row.module),kind=value(row.data?.kind);
 if(!targetModule)return undefined;
 if(targetModule==="Risk Assessment"){
  const ref=value(row.id);return ref&&!ref.startsWith("enterprise:")?{module:targetModule,ref,filterKey:"riskRef"}:undefined;
 }
 if(targetModule==="Bulgular ve CAPA"){
  if(kind==="remediation")return undefined;
  const ref=value(row.code)||(!value(row.id).startsWith("enterprise:")?value(row.id):"");
  return ref?{module:targetModule,ref,filterKey:"findingRef"}:undefined;
 }
 if(targetModule==="Kontroller"){
  const ref=value(row.code)||(!value(row.id).startsWith("enterprise:")?value(row.id):"");
  return ref?{module:targetModule,ref,filterKey:"controlRef"}:undefined;
 }
 if(targetModule==="Kanıt Otomasyonu"){
  let ref="";
  if(kind==="automation-rule")ref=canonicalRuleRef(row.data?.aliasRefs);
  else if(kind.startsWith("automation-"))ref=canonicalRuleRef(row.data?.automationRuleRef);
  else if(!value(row.id).startsWith("enterprise:"))ref=value(row.id)||value(row.code);
  return ref?{module:targetModule,ref,filterKey:"ruleRef"}:undefined;
 }
 return undefined;
}
