import { iso27001Management } from '../api/grc/iso27001-management';
import { soc2TemplateControls, soc2TemplateMeta } from '../api/grc/soc2-template';
import { frameworkTemplateCatalogs } from '../api/grc/framework-catalogs';
import { automaticAuditTemplates } from '../framework-templates';
import { iso27001Refs, iso27001Titles } from './iso-annex';

export const ISO = 'ISO/IEC 27001:2022';
export const SOC = soc2TemplateMeta.name;
export const programName = (template: string) => ['SOC 2 Type I','SOC 2 Type II'].includes(template) ? SOC : template;
export const frameworkNames = [...new Set(automaticAuditTemplates.map(programName))].filter(name =>
  name === ISO || name === SOC || Object.hasOwn(frameworkTemplateCatalogs, name));
export function catalogFor(name: string) {
  if (name === ISO) return [...iso27001Management.map(r => ({ref:r.ref,title:r.title,group:r.category,annex:false})),
    ...iso27001Refs.map(ref => ({ref,title:iso27001Titles[ref],group:ref.split('.').slice(0,2).join('.'),annex:true}))];
  if (name === SOC) return soc2TemplateControls.map(r => ({ref:r.tscId,title:r.expectation,group:r.tscCategory,annex:false}));
  if (!frameworkNames.includes(name)) return [];
  return frameworkTemplateCatalogs[name].map(r => ({ref:r.ref,title:r.title,group:r.category,annex:false}));
}
