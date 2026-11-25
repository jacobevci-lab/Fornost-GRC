import {parseDraftTemplate, type DraftTemplate, type TemplateKind} from './audit-draft-templates';
import {validateAuditCalendar,type AuditCalendar} from './audit-calendar-template';

export type SharedTemplateKind = TemplateKind | 'task-pack' | 'calendar';
export type SharedCalendarTemplate = {version:1;kind:'calendar';name:string;calendar:AuditCalendar};
export type TaskPackTemplate = {version:1;kind:'task-pack';name:string;chain:boolean;tasks:{title:string;description:string}[]};
export type SharedTemplate = DraftTemplate | TaskPackTemplate | SharedCalendarTemplate;
export type SharedTemplateSummary = {id:string;kind:SharedTemplateKind;name:string;revision:string;version:number;archived:boolean;updatedBy:string;updatedAt:string};
export type SharedTemplateRecord = SharedTemplateSummary & {template:SharedTemplate;createdAt:string};
export type SharedTemplateVersion = {revision:string;version:number;action:string;actor:string;note:string;createdAt:string};
export function sharedTemplateKind(value:unknown): SharedTemplateKind {
 if(value!=='plan'&&value!=='milestone'&&value!=='task-pack'&&value!=='calendar')throw Error('fields');
 return value;
}
/** Library definitions exclude record IDs, people, operational deadlines and lifecycle state. */
export function validateSharedTemplate(value:unknown):SharedTemplate {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('fields');
 const row=value as Record<string,unknown>,kind=sharedTemplateKind(row.kind);
 if(kind==='calendar'){
  if(Object.keys(row).sort().join(',')!=='calendar,kind,name,version'||row.version!==1||typeof row.name!=='string'||!row.name.trim()||row.name.length>80)throw Error('fields');
  return {version:1,kind,name:row.name.trim(),calendar:validateAuditCalendar(row.calendar)};
 }
 if(kind!=='task-pack'){
  const template=parseDraftTemplate(JSON.stringify(value),kind);
  if(!Object.values(template.fields).some(text=>text.trim()))throw Error('fields');
  return template;
 }
 if(Object.keys(row).some(key=>!['version','kind','name','chain','tasks'].includes(key))||row.version!==1||typeof row.name!=='string'||!row.name.trim()||row.name.length>80||typeof row.chain!=='boolean'||!Array.isArray(row.tasks)||!row.tasks.length||row.tasks.length>12)throw Error('fields');
 const tasks=row.tasks.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['title','description'].includes(key))||typeof item.title!=='string'||item.title.trim().length<3||item.title.length>200||typeof item.description!=='string'||item.description.length>2000)throw Error('fields');
  return {title:item.title.trim(),description:item.description.trim()};
 });
 return {version:1,kind,name:row.name.trim(),chain:row.chain,tasks};
}
