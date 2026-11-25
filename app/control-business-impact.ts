import type { ConnectedGrcLink, ConnectedGrcRow, UnresolvedGrcReference } from './connected-grc-model';
import { hasRecoveryTarget } from './bia-recovery';

export type BusinessImpactRecord = {
  row: ConnectedGrcRow;
  origin: 'control' | 'linked-risk';
  path: ConnectedGrcRow[];
  relations: string[];
  critical: boolean;
  recovery: { rto: number | null; rpo: number | null; mtpd: number | null };
};
export type ControlBusinessImpact = {
  assets: BusinessImpactRecord[];
  processes: BusinessImpactRecord[];
  unresolved: UnresolvedGrcReference[];
};
const key = (value: unknown) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('tr-TR');
const target = (value: unknown) => hasRecoveryTarget(value) ? Number(value) : null;

/** Potential exposure through resolved dependencies, never a forecast or a risk-rating mutation. */
export function buildControlBusinessImpact(control: ConnectedGrcRow, risks: ConnectedGrcRow[], links: ConnectedGrcLink[], unresolved: UnresolvedGrcReference[]): ControlBusinessImpact {
  const assets = new Map<string, BusinessImpactRecord>(), processes = new Map<string, BusinessImpactRecord>();
  const outgoing = new Map<string, ConnectedGrcLink[]>(), incoming = new Map<string, ConnectedGrcLink[]>();
  for (const link of links) {
    const from = outgoing.get(link.source.id) || [], to = incoming.get(link.target.id) || [];
    from.push(link); to.push(link);
    outgoing.set(link.source.id, from); incoming.set(link.target.id, to);
  }
  const add = (row: ConnectedGrcRow, origin: BusinessImpactRecord['origin'], path: ConnectedGrcRow[], relations: string[]) => {
    if (path.some(item => item.id === row.id)) return;
    const records = row.module === 'BIA' ? processes : assets;
    const candidate: BusinessImpactRecord = { row, origin, path: [...path, row], relations,
      critical: ['critical', 'kritik'].includes(key(row.data.criticality)),
      recovery: { rto: target(row.data.rto), rpo: target(row.data.rpo), mtpd: target(row.data.mtpd) } };
    const previous = records.get(row.id);
    // Deterministic shortest explanation. An item is counted only once, even with several paths.
    const identity = (item: BusinessImpactRecord) => item.path.map(step => step.id).join('|');
    if (!previous || candidate.path.length < previous.path.length || (candidate.path.length === previous.path.length && identity(candidate) < identity(previous))) records.set(row.id, candidate);
  };
  for (const origin of [control, ...risks]) {
    const kind = origin.id === control.id ? 'control' : 'linked-risk';
    for (const link of outgoing.get(origin.id) || []) {
      if (link.target.module === 'BIA' && ['risk-process', 'continuity-process'].includes(link.relation)) add(link.target, kind, [origin], [link.relation]);
      if (origin.module === 'Risk Assessment' && link.target.module === 'Varlık Envanteri' && link.relation === 'risk-asset') add(link.target, kind, [origin], [link.relation]);
    }
  }
  // A directly linked process exposes its own assets; no recursive dependency flood-fill.
  for (const process of [...processes.values()]) for (const link of outgoing.get(process.row.id) || []) {
    if (link.relation === 'risk-asset' && link.target.module === 'Varlık Envanteri') add(link.target, process.origin, process.path, [...process.relations, link.relation]);
  }
  // Other BIA processes explicitly depending on an exposed asset are potentially affected.
  // Do not traverse their other assets or infer a link between unrelated risks.
  for (const asset of assets.values()) for (const link of incoming.get(asset.row.id) || []) {
    if (link.relation === 'risk-asset' && link.source.module === 'BIA') add(link.source, asset.origin, asset.path, [...asset.relations, link.relation]);
  }
  const visited = new Set([control.id, ...risks.map(row => row.id), ...assets.keys(), ...processes.keys()]);
  const sorted = (items: Map<string, BusinessImpactRecord>) => [...items.values()].sort((a, b) => Number(b.critical) - Number(a.critical) || (a.row.code || a.row.id).localeCompare(b.row.code || b.row.id));
  return { assets: sorted(assets), processes: sorted(processes), unresolved: unresolved.filter(item => visited.has(item.source.id) && ['risk-asset', 'risk-process', 'continuity-process'].includes(item.relation)) };
}
