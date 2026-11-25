import type { AssuranceRow } from "./control-assurance";

export type EvidenceIntegritySnapshot = {
  integrity: string;
  checkedVersions: number;
  failedVersion: number;
};

const text = (value: unknown) => String(value ?? "").normalize("NFKC").trim();

export function evidenceIntegritySnapshots(history: unknown) {
  const source = history && typeof history === "object" ? history as Record<string, unknown> : {};
  const snapshots: Record<string, EvidenceIntegritySnapshot> = {};
  const items = Array.isArray(source.evidenceItems) ? source.evidenceItems as Record<string, unknown>[] : [];
  for (const item of items) {
    const id = text(item.id);
    const integrity = text(item.integrity);
    if (!id || !integrity) continue;
    snapshots[id] = {
      integrity,
      checkedVersions: Number(item.checkedVersions || 0),
      failedVersion: Number(item.failedVersion || 0),
    };
  }
  return snapshots;
}

export function applyEvidenceIntegritySnapshots(
  rows: AssuranceRow[],
  snapshots: Record<string, EvidenceIntegritySnapshot>,
) {
  return rows.map((row) => {
    if (row.module !== "Kanıtlar") return row;
    const snapshot = snapshots[row.id];
    if (!snapshot) return row;
    return {
      ...row,
      data: {
        ...row.data,
        evidenceIntegrity: snapshot.integrity,
        evidenceIntegrityCheckedVersions: snapshot.checkedVersions,
        evidenceIntegrityFailedVersion: snapshot.failedVersion,
      },
    };
  });
}

export function applyEvidenceIntegrityHistory(rows: AssuranceRow[], history: unknown) {
  return applyEvidenceIntegritySnapshots(rows, evidenceIntegritySnapshots(history));
}
