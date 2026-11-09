import { connectedTitle, type ConnectedGrcLink, type ConnectedGrcRow as Row } from "./connected-grc-model";
import { indexTrailLinks } from "./module-record-trail";

export const businessModules = ["Varlık Envanteri","Risk Assessment","BIA","İş Sürekliliği"] as const;
type Stage = "asset" | "risk" | "bia" | "plan";
const stages:Stage[] = ["asset","risk","bia","plan"];
function stage(row:Row): Stage | undefined {
  if (row.module === "İş Sürekliliği" && row.data.kind !== "continuity-plan") return undefined;
  return stages[businessModules.indexOf(row.module as typeof businessModules[number])];
}
export const hasBusinessContext = (row: Row) => stage(row) !== undefined;
type ContextNode = {row:Row; via:Row[]};

// Each route is rooted at the selected record. Never expand through a sibling risk
// to infer links from its other assets, or combine independent branches.
const routes:Record<Stage,Stage[][]> = {
  risk:[["asset","bia","plan"],["bia","plan"]],
  asset:[["risk","bia","plan"],["bia","plan"]],
  bia:[["asset","risk"],["risk","asset"],["plan"]],
  plan:[["bia","asset","risk"],["bia","risk","asset"]],
};
export function businessContext(anchor:Row,links:ConnectedGrcLink[]) {
  const origin=stage(anchor);
  const result=new Map<Stage,Map<string,ContextNode>>(stages.map(s=>[s,new Map()]));
  if (origin) {
    const edges=links.filter(link=>["risk-asset","risk-process","continuity-process","continuity-bia"].includes(link.relation));
    const index=indexTrailLinks(edges);
    result.get(origin)!.set(anchor.id,{row:anchor,via:[]});
    for (const route of routes[origin]) {
      let current:ContextNode[]=[{row:anchor,via:[]}];
      for (const target of route) {
        const next=new Map<string,ContextNode>();
        for (const item of current) for (const hop of index.get(item.row.id)||[]) {
          if (stage(hop.row)!==target || next.has(hop.row.id)) continue;
          const via=item.row.id===anchor.id?[]:[...item.via,item.row];
          const node={row:hop.row,via};
          next.set(hop.row.id,node);
          const collection=result.get(target)!;
          const before=collection.get(hop.row.id);
          if (!before || via.length<before.via.length) collection.set(hop.row.id,node);
        }
        current=[...next.values()];
      }
    }
  }
  return stages.map(stage=>({stage,nodes:[...result.get(stage)!.values()].sort((a,b)=>a.via.length-b.via.length || connectedTitle(a.row).localeCompare(connectedTitle(b.row)))}));
}
