import {auditTypes} from '../audit-engagement';
export type EditableField={field:string;storage:'json'|'column';column:string;states:string[];actorColumn?:string};
export function editableField(kind:string,table:string):EditableField{
 const json=(column:string,states:string[]):EditableField=>({field:column,storage:'json',column,states});
 switch(kind){
  case 'risk':return json('description',['Açık','Değerlendiriliyor','Aksiyon Devam Ediyor']);
  case 'asset':return json('description',['Planlanan','Aktif','Bakımda']);
  case 'bia':return json('description',['Taslak']);
  case 'control':return json('description',['Taslak','İyileştirme Gerekli']);
  case 'vendor':return table==='third_party_profiles'?{field:'contact',storage:'column',column:'contact',states:['onboarding','active','draft','in_review','Aktif','İncelemede']} :json('service',['Aktif','İncelemede']);
  case 'policy':return {field:'audience',storage:'column',column:'audience',states:['draft'],actorColumn:'owner'};
  case 'audit':return {field:'audit_type',storage:'column',column:'audit_type',states:['Başlanmadı'],actorColumn:'audit_owner'};
  case 'finding':return {field:'description',storage:'column',column:'description',states:['open'],actorColumn:'owner'};
  case 'incident':return {field:'business_impact',storage:'column',column:'business_impact',states:['declared'],actorColumn:'owner'};
  default:throw Error('Unknown module');
 }
}
export function validFieldValue(field:string,value:unknown):value is string{
 if(typeof value!=='string'||value.length>1000)return false;
 if(field==='audit_type')return auditTypes.some(pair=>pair[0]===value);
 return !['audience','service'].includes(field)||!!value.trim();
}
