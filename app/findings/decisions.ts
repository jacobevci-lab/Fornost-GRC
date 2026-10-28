import {findingActionAvailability} from './presentation';
export type FindingDecisionContext={record:Record<string,string|number|null>;revision:string};
export const findingEvidenceOperations=['submit','verify','accept-risk'];
export const findingDecisionPhrases:Record<string,string>={start:'CAPA AKSİYONUNU BAŞLAT',submit:'CAPA DOĞRULAMAYA GÖNDER',verify:'BULGUYU KAPAT',reopen:'BULGUYU YENİDEN AÇ','accept-risk':'BULGU RİSKİNİ KABUL ET'};
export function findingDecisionAvailable(context:FindingDecisionContext,operation:string,actor:{role:string;email:string}){
 const r=context.record,available=findingActionAvailability({status:String(r.status),owner:String(r.owner),reviewer:String(r.reviewer),detectedBy:r.detected_by as string|null,submittedBy:r.submitted_by as string|null},actor);
 return available[operation==='accept-risk'?'acceptRisk':operation as keyof typeof available]===true;
}
