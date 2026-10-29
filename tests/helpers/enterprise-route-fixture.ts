import * as vendorContract from "../../app/third-party-risk/contract-extension";
import * as vendorContractStore from "../../app/third-party-risk/contract-extension-store";
import * as vendorReviewSchedule from '../../app/third-party-risk/review-schedule';
import * as vendorWork from '../../app/third-party-risk/work-source';
import * as campaignIssuance from '../../app/policy-lifecycle/campaign-issuance-store';
import * as policyAttestations from '../../app/policy-lifecycle/attestation-store';
import * as policyReviews from '../../app/policy-lifecycle/periodic-review-store';
import * as incidentWork from '../../app/incidents/work-source';
import * as incidentDecisions from '../../app/incidents/decision-store';
import * as incidentDecisionDomain from '../../app/incidents/decisions';
import * as policyDecisions from '../../app/policy-lifecycle/decision-store';
import * as policyCampaigns from '../../app/policy-lifecycle/campaign-store';
import * as continuityPlan from '../../app/continuity/plan';
import * as continuityReviews from '../../app/continuity/plan-review-store';
import * as continuityWork from '../../app/continuity/work-source';
import * as workflowFocus from '../../app/workflow-record-focus';
import * as workflowSelections from '../../app/workflow-selection-store';
import type {Actor} from '../../app/api/auth/security';
import * as findingDomain from '../../app/findings/domain';
import * as findingDecisions from '../../app/findings/decision-store';
import * as findingIntake from '../../app/findings/intake-store';
import * as findingTransition from '../../app/findings/transition-store';
import * as findingExport from '../../app/findings/export';
import * as findingSchema from '../../app/api/findings/schema-compat';
import * as findingReport from '../../app/findings/report-page';
import * as findingRegister from '../../app/findings/register';
import * as intake from '../../app/enterprise-reference-intake';
import * as references from '../../app/core-reference-write';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as writes from '../../app/enterprise-lifecycle-write';
import * as incidents from '../../app/incidents/domain';
import * as continuity from '../../app/continuity/domain';
import * as policy from '../../app/policy-lifecycle/domain';
import * as vendor from '../../app/third-party-risk/domain';
import * as risk from '../../app/risk-appetite/domain';
import * as riskMethodology from '../../app/risk-methodology';
import * as regulatory from '../../app/regulatory-intelligence/domain';
import {safeHttpUrl} from '../../app/api/integrations/security';
// Execute actual route handlers and SQL against transactional SQLite; substitute only platform/auth adapters.
export function fixture(module:'incidents'|'continuity'|'policy-lifecycle'|'third-party-risk'|'risk-appetite'|'regulatory-intelligence'|'findings',triggerInclusive=false) {
 const sqlite=new DatabaseSync(':memory:'); let actor:Actor={id:'reviewer',name:'Reviewer',role:'Admin',email:'reviewer@example.com',source:'local'}; let beforeBatch:(()=>void)|undefined;
 type Value=string|number|null;
 function prepare(sql:string,values:Value[]=[]){return{
  bind(...args:Value[]){return prepare(sql,args);},
  async first(){return sqlite.prepare(sql).get(...values)||null;},
  async all(){return{results:sqlite.prepare(sql).all(...values)};},
  async run(){return this.exec();},
  exec(){const before=Number(sqlite.prepare("SELECT total_changes() n").get()!.n);const result=sqlite.prepare(sql).run(...values);return{success:true,meta:{changes:triggerInclusive?Number(sqlite.prepare("SELECT total_changes() n").get()!.n)-before:Number(result.changes)}};}
 };}
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){const hook=beforeBatch;beforeBatch=undefined;hook?.();sqlite.exec('BEGIN');try{const results=statements.map(s=>s.exec());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const source=readFileSync(`app/api/${module}/route.ts`,'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:Record<string,unknown>={};
 const require=(name:string)=>{
  if(name==='next/server')return{NextResponse:{json:(body:unknown,options:{status:number})=>({body,status:options.status})}};
  if(name==='cloudflare:workers')return{env:{DB:db}};
  if(name==='../auth/security')return{requireRole:async()=>({actor})};
  if(name==='../integrations/security')return{safeHttpUrl,clean:(x:unknown,n:number)=>String(x??'').trim().slice(0,n)};
  if(name==='../../workflow-selection-store')return workflowSelections;
  if(name==='../../workflow-record-focus')return workflowFocus;
  if(name==='../../enterprise-lifecycle-write')return writes;
  if(name==='../../enterprise-reference-intake')return intake;
  if(name==='../../core-reference-write')return references;
  if(name==='../../incidents/decision-store')return incidentDecisions;
  if(name==='../../incidents/decisions')return incidentDecisionDomain;
  if(name==='../../incidents/domain')return incidents;
  if(name==='../../incidents/work-source')return incidentWork;
  if(name==='../../continuity/domain')return continuity;
  if(name==='../../continuity/work-source')return continuityWork;
  if(name==='../../continuity/plan')return continuityPlan;
  if(name==='../../continuity/plan-review-store')return continuityReviews;
  if(name==='../../policy-lifecycle/decision-store')return policyDecisions;
  if(name==='../../policy-lifecycle/campaign-store')return policyCampaigns;
  if(name==='../../policy-lifecycle/campaign-issuance-store')return campaignIssuance;
  if(name==='../../policy-lifecycle/attestation-store')return policyAttestations;
  if(name==='../../policy-lifecycle/periodic-review-store')return policyReviews;
  if(name==='../../policy-lifecycle/domain')return policy;
  if(name==='../../third-party-risk/contract-extension')return vendorContract;
  if(name==='../../third-party-risk/contract-extension-store')return vendorContractStore;
  if(name==='../../third-party-risk/review-schedule')return vendorReviewSchedule;
  if(name==='../../third-party-risk/work-source')return vendorWork;
  if(name==='../../third-party-risk/domain')return vendor;
  if(name==='../../risk-appetite/domain')return risk;
  if(name==='../../risk-methodology')return riskMethodology;
  if(name==='../../regulatory-intelligence/domain')return regulatory;
  if(name==='../../findings/domain')return findingDomain;
  if(name==='../../findings/decision-store')return findingDecisions;
  if(name==='../../findings/intake-store')return findingIntake;
  if(name==='../../findings/transition-store')return findingTransition;
  if(name==='../../findings/export')return findingExport;
  if(name==='./schema-compat')return findingSchema;
  if(name==='../../findings/report-page')return findingReport;
  if(name==='../../findings/register')return findingRegister;
  throw new Error(name);
 };
 new Function('require','exports',compiled)(require,exports);
 const post=(body:Record<string,unknown>)=>(exports.POST as (req:unknown)=>Promise<{status:number;body:Record<string,unknown>}> )({headers:new Headers(),json:async()=>body});
 const get=(query='')=>(exports.GET as (req:unknown)=>Promise<{status:number;body:Record<string,unknown>}>)({headers:new Headers(),nextUrl:new URL('http://localhost/api/'+module+(query?'?'+query:''))});
 return{sqlite,db:db as unknown as D1Database,post,get,setActor:(value:Actor)=>{actor=value},before:(hook:()=>void)=>{beforeBatch=hook;}};
}
