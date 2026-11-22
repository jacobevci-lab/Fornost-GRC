export type Coverage = 'supports' | 'partial';
export type Applicability = 'required' | 'undecided' | 'included' | 'excluded';
export type Mapping = { id:string; coverage:Coverage };
export type Pin = {id:string; evidenceId:string; fileKey:string; title:string; version:number; hash:string; period:string};
export type Control = {id:string; code:string; title:string; implementation:string};
export type Requirement = {ref:string; title:string; group:string; annex:boolean; applicability:Applicability; reason:string; revision:string; links:Mapping[]};
export type Matrix = {name:string; requirements:Requirement[]; controls:Control[]; pins:Record<string,Pin[]>};
export type Baseline = {framework:string; period:string; total:number; excluded:number; withEvidence:number;
  entries:{ref:string; title:string; applicability:Applicability; reason:string; controls:(Control & {coverage:Coverage; evidence:string[]})[]}[];
  evidence:Record<string,Pin>};
export type ControlClause = Pick<Requirement,"ref"|"title"|"revision"> & {linked:boolean};
export type ControlCatalog = {programs:{name:string;clauses:ControlClause[]}[]};
export type ControlMappingChange = {name:string;ref:string;revision:string;linked:boolean};
export type ProgramIndex = {catalog:string[]; enrolled:string[]};

export type ProgramCoverage = {scope:number; assessed:number; evidenced:number; compliant:number};
export type OpenItem = {ref:string;title:string;state:"unmapped"|"implementation"|"partial"|"evidence"|"decision";controlCode?:string};
export type Comparison = {openCount:number;items:OpenItem[]};
export type Overview = ProgramIndex & {controlFrameworkCounts:Record<string,number>;coverage:Record<string,ProgramCoverage>;comparison:Record<string,Comparison>};
