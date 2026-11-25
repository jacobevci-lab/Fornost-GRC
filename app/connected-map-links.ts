import {contextTypes,contextRelation,contextPairAllowed} from './connected-map-context';
import {canWriteModule,type AccessSubject} from './module-access';
import {editableConnections,type WorkbenchIssue} from './connected-grc-workbench-model';
import {connectedRemediationModule,relationFields,type ConnectedGrcLink as Link,type ConnectedGrcRow as Row} from './connected-grc-model';

export type LinkChoice={key:string;field:string;module:string;reverse:boolean;plan:boolean;label:[string,string];relation:string};
export const nativeMapId=(r:Row)=>r.data.kind==='continuity-plan'?String((r.data.canonicalRefs as string[])?.[0]||''):r.id;
export function linkChoices(row:Row,actor:AccessSubject,modules:string[]=[]){
  const choices:LinkChoice[]=[];
  if(!['Admin','Editor'].includes(actor.role))return choices;
  const context:LinkChoice[]=[];
  if(canWriteModule(actor,row.module)){
    for(const targetModule of modules){
      for(const [type,label] of Object.entries(contextTypes)){
        if(!contextPairAllowed(type,row.module,targetModule))continue;
        context.push({
          key:'context:'+targetModule+':'+type,field:'context-'+type,module:targetModule,
          reverse:false,plan:false,label:[...label],relation:contextRelation(type),
        });
      }
    }
  }
  if(row.module==='BIA'||row.data.kind==='continuity-plan')choices.push({key:'plan',field:'continuityBiaRef',module:row.module==='BIA'?'İş Sürekliliği':'BIA',reverse:row.module==='BIA',plan:true,label:['Süreklilik planı / BIA','Continuity plan / BIA'],relation:'continuity-bia'});
  if(row.id.startsWith('enterprise:'))return [...choices,...context];
  for(const [module,rules] of Object.entries(editableConnections)){
    if(!canWriteModule(actor,module))continue;
    for(const rule of rules){
      const relation=relationFields[rule.field]?.relation||'';
      if(module===row.module)for(const target of rule.target)choices.push({key:rule.field+':'+target,field:rule.field,module:target,reverse:false,plan:false,label:rule.label,relation});
      if(rule.target.includes(row.module))choices.push({key:'reverse:'+module+':'+rule.field,field:rule.field,module,reverse:true,plan:false,label:rule.label,relation});
    }
  }
  return [...choices,...context];
}
export function issueChoice(choices:LinkChoice[],issue?:WorkbenchIssue):LinkChoice|undefined{
  if(!issue)return choices.find(c=>!c.reverse&&!c.field.startsWith('context-'))||choices.find(c=>!c.field.startsWith('context-'))||choices[0];
  const exact=choices.find(c=>c.field===issue.field);
  if(exact)return exact;
  for(const relation of issue.relations){
    const same=choices.find(c=>c.relation===relation&&!c.reverse)||choices.find(c=>c.relation===relation);
    if(same)return same;
  }
  return choices.find(c=>issue.relations.some(r=>connectedRemediationModule[r]===c.module))||issueChoice(choices);
}
export function editableEdge(edge:Link,links:Link[],actor:AccessSubject){
  const source=edge.source;
  if(edge.field==='mapContext'&&canWriteModule(actor,source.module))return edge.field;
  if(source.id.startsWith('enterprise:')||edge.target.id.startsWith('enterprise:')||!canWriteModule(actor,source.module))return;
  const field=source.module==='Kanıtlar'&&edge.field==='controlRef'?'controlRefs':edge.field;
  const rule=editableConnections[source.module]?.find(r=>r.field===field);
  if(!rule||rule.required&&(!rule.multiple||links.filter(e=>e.source.id===source.id&&(e.field===field||field==='controlRefs'&&e.field==='controlRef')).length<2))return;
  return field;
}
