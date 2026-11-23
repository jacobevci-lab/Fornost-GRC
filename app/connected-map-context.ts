import {connectedRelationLabels,type ConnectedGrcRow as Row,type ConnectedGrcLink as Link} from './connected-grc-model';

const declared:Record<string,[string,string]>={
  'requirement-map':['Kontroller','Uyum'],
  'finding-risk':['Bulgular ve CAPA','Risk Assessment'],
  'finding-control':['Bulgular ve CAPA','Kontroller'],
  'incident-asset':['Güvenlik Olayları','Varlık Envanteri'],
  'incident-risk':['Güvenlik Olayları','Risk Assessment'],
  'incident-bia':['Güvenlik Olayları','BIA'],
  'policy-control':['Politika Merkezi','Kontroller'],
  'policy-risk':['Politika Merkezi','Risk Assessment'],
  'regulatory-control':['Regülasyon Merkezi','Kontroller'],
  'regulatory-risk':['Regülasyon Merkezi','Risk Assessment'],
  'regulatory-policy':['Regülasyon Merkezi','Politika Merkezi'],
};
export const contextTypes:Record<string,[string,string]>={
  'requirement-map':['Gereksinime bağlıdır','Maps to requirement'],
  ...Object.fromEntries(Object.keys(declared).filter(type=>type!=='requirement-map').map(type=>[type,[connectedRelationLabels[type].tr,connectedRelationLabels[type].en]])),
  related:['İlişkilidir','Related to'],affects:['Etkiler','Affects'],hosts:['Barındırır','Hosts'],improves:['İyileştirir','Improves'],
};
export function contextPairAllowed(type:string,source:string,target:string){
  if(!Object.hasOwn(contextTypes,type))return false;
  const pair=declared[type];
  return !pair||source===pair[0]&&target===pair[1];
}
export function contextRelation(type:string){
  if(type==='requirement-map')return 'control-framework';
  return Object.hasOwn(declared,type)?type:'context-'+type;
}
export const storedContextType=(relation:string)=>relation==='control-framework'?'requirement-map':relation.replace(/^context-/,'');
export const contextId=(row:Row)=>row.id.replace(/^enterprise:finding-manual:/,'enterprise:finding:');
export type MapContextEdge={id:string;source_id:string;target_id:string;relation:string};
export function contextLinks(rows:Row[],edges:MapContextEdge[]):Link[]{
  const byId=new Map(rows.map(row=>[contextId(row),row])),links:Link[]=[];
  for(const edge of edges){
    const source=byId.get(edge.source_id),target=byId.get(edge.target_id);
    if(source&&target&&contextPairAllowed(edge.relation,source.module,target.module)){
      links.push({source,target,matched:edge.id,field:'mapContext',relation:contextRelation(edge.relation)});
    }
  }
  return links;
}
