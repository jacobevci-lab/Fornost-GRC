import { connectedTitle, type ConnectedGrcLink, type ConnectedGrcRow } from "./connected-grc-model";
import type { ConnectedGrcEnterprisePayloads } from "./connected-grc-sources";

type Source = keyof ConnectedGrcEnterprisePayloads;
// Load neighbouring enterprise sources only on demand. Core records already belong to the current session.
export const moduleTrailSources: Record<string, Source[]> = {
  "BIA": ["continuity", "incidents"],
  "Varlık Envanteri": ["continuity", "incidents", "thirdParty"],
  "Uyum": ["policy", "regulatory"],
  "Denetim Yönetimi": ["findings"],
  "Tedarikçiler": ["thirdParty", "findings"],
  "Bulgular ve CAPA": ["findings", "thirdParty", "incidents", "evidenceAutomation", "policy", "regulatory"],
  "İş Sürekliliği": ["continuity", "incidents"],
  "Güvenlik Olayları": ["incidents", "findings", "continuity"],
  "Politika Merkezi": ["policy", "regulatory", "findings"],
  "Regülasyon Merkezi": ["regulatory", "policy", "findings"],
  "Risk İştahı ve KRI": ["riskAppetite"],
  "Kanıt Otomasyonu": ["evidenceAutomation", "findings"],
  "AI Yönetişimi": ["aiModels", "aiFindings", "aiAlerts"],
};

const preferred: Record<string,string[]> = {
  "Denetim Yönetimi":["audit-control","control-evidence","audit-evidence","audit-risk"],
  "Kontroller":["control-evidence","risk-control"],
  "Uyum":["control-evidence","control-framework"],
  "Varlık Envanteri":["risk-asset","asset-vendor","incident-asset"],
  "Risk Assessment":["risk-control","risk-asset","risk-process"],
  "BIA":["continuity-bia","continuity-process","risk-process","risk-asset"],
  "Tedarikçiler":["finding-vendor","assessment-finding","vendor-assessment","asset-vendor"],
  "Bulgular ve CAPA":["finding-remediation","finding-control","finding-risk"],
};

type Hop = { row: ConnectedGrcRow; edge: ConnectedGrcLink };
export function indexTrailLinks(links: ConnectedGrcLink[]) {
  const index = new Map<string, Hop[]>();
  function add(from: string, row: ConnectedGrcRow, edge: ConnectedGrcLink) {
    const choices = index.get(from);
    const hop = {row,edge};
    if (choices) choices.push(hop); else index.set(from,[hop]);
  }
  for (const link of links) {
    add(link.source.id, link.target, link);
    add(link.target.id, link.source, link);
  }
  return index;
}

export function trailChoices(index: ReturnType<typeof indexTrailLinks>, row: ConnectedGrcRow, visited: Set<string>) {
  const priority = preferred[row.module] || [];
  const rank = (hop: Hop) => {
    const p = priority.indexOf(hop.edge.relation);
    // BIA and risk records both refer to assets. Start with a risk when one exists.
    if (row.module === "Varlık Envanteri" && hop.row.module === "Risk Assessment" && hop.edge.relation === "risk-asset") return -1;
    // A control's evidence is the next useful step after an audit or risk.
    if (row.module === "Kontroller" && hop.row.module === "Kanıtlar") return -1;
    return p < 0 ? priority.length : p;
  };
  const sorted = (index.get(row.id) || []).filter(hop => !visited.has(hop.row.id))
    .sort((a,b) => rank(a)-rank(b) || connectedTitle(a.row).localeCompare(connectedTitle(b.row)) || a.row.id.localeCompare(b.row.id));
  const unique = new Map<string, Hop>();
  for (const hop of sorted) if (!unique.has(hop.row.id)) unique.set(hop.row.id,hop);
  return [...unique.values()];
}

export function traceRecords(index: ReturnType<typeof indexTrailLinks>, root: ConnectedGrcRow, selected: string[], length: number) {
  const nodes: {row: ConnectedGrcRow; alternatives: Hop[]; edge?: ConnectedGrcLink}[] = [{row:root,alternatives:[]}];
  const visited = new Set([root.id]);
  while (nodes.length < length) {
    const options = trailChoices(index,nodes[nodes.length-1].row,visited);
    if (!options.length) break;
    const next = options.find(option => option.row.id === selected[nodes.length-1]) || options[0];
    nodes.push({row:next.row,alternatives:options,edge:next.edge});
    visited.add(next.row.id);
  }
  return {nodes,more:trailChoices(index,nodes[nodes.length-1].row,visited).length > 0};
}
