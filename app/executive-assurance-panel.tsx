"use client";
import { useExecutiveAssurance } from "./use-executive-assurance";
import type { AssuranceRow } from "./control-assurance";
import ExecutiveDashboardReference from "./executive-dashboard-reference";

export type DashboardRoutes = {go:(module:string)=>void; drill:(module:string,framework?:string)=>void; upload?:()=>void};
export default function ExecutiveAssurancePanel({rows,...props}:DashboardRoutes & {rows:AssuranceRow[];lang:"tr"|"en"}) {
  const evidenceState=useExecutiveAssurance(rows);
  return <ExecutiveDashboardReference rows={rows} evidenceState={evidenceState} {...props}/>;
}
