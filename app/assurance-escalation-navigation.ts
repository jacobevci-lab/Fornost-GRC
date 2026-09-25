export type AssuranceEscalationFilterKey="ruleRef"|"findingRef"|"riskRef"|"controlRef";
export type AssuranceEscalationNavigation={module:string;recordRef:string;filterKey:AssuranceEscalationFilterKey};

const text=(value:unknown)=>String(value||"").trim();

export function assuranceEscalationNavigation(kind:string,source:Record<string,unknown>):AssuranceEscalationNavigation|undefined{
 const riskRef=text(source.riskId||source.riskRef);
 const controlRef=text(source.controlRef);
 const ruleRef=text(source.ruleId);
 const findingRef=text(source.findingCode||source.findingRef);
 if(kind==="risk-review"&&riskRef)return{module:"Risk Assessment",recordRef:riskRef,filterKey:"riskRef"};
 if(kind==="exception-expiry"){
  if(controlRef)return{module:"Kontroller",recordRef:controlRef,filterKey:"controlRef"};
  if(riskRef)return{module:"Risk Assessment",recordRef:riskRef,filterKey:"riskRef"};
  if(ruleRef)return{module:"Kanıt Otomasyonu",recordRef:ruleRef,filterKey:"ruleRef"};
  if(findingRef)return{module:"Bulgular ve CAPA",recordRef:findingRef,filterKey:"findingRef"};
 }
 if((kind==="mandatory-retest"||kind==="retest-failure")&&ruleRef)return{module:"Kanıt Otomasyonu",recordRef:ruleRef,filterKey:"ruleRef"};
 if((kind==="mandatory-retest"||kind==="retest-failure")&&findingRef)return{module:"Bulgular ve CAPA",recordRef:findingRef,filterKey:"findingRef"};
 return undefined;
}
