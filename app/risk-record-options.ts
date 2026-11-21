import type { ConnectedGrcRow } from "./connected-grc-model";
import { connectionValues } from "./connected-grc-workbench-model";
import { isLegacyTechnicalRecordId } from "./record-codes";

export const normalizeRiskSearch = (s: string) => s.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replaceAll("ı", "i").trim();
export function riskRecordOptions(rows: ConnectedGrcRow[], module: "Kontroller" | "Varlık Envanteri") {
  const identity = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g," ");
  const catalog = rows.filter(row => row.module === module);
  const keys = new Map<string, ConnectedGrcRow | null>();
  const aliases = new Map<string, ConnectedGrcRow | null>();
  function add(index: typeof keys, key: unknown, row: ConnectedGrcRow) {
    const normalized = identity(String(key || ""));
    if (normalized) index.set(normalized, index.has(normalized) && index.get(normalized) !== row ? null : row);
  }
  const ids = new Map(catalog.map(row => [identity(row.id), row]));
  for (const row of catalog) {
    add(keys, row.code, row);
    const values = module === "Kontroller" ? [row.data.controlRef] : [row.data.assetId, row.data.title];
    for (const alias of values) add(aliases, alias, row);
  }
  function resolve(value: string) {
    const key = identity(value);
    return ids.get(key) || (keys.has(key) ? keys.get(key) : aliases.get(key));
  }
  function label(row: ConnectedGrcRow) {
    const code = [row.code, row.id].find(value => value && /^(CTL|AST)-\d+$/i.test(value));
    const name = String((module === "Kontroller" ? row.data.controlTitle || row.data.controlRef : row.data.title) || "");
    return [name, code].filter((v, i, all) => v && all.indexOf(v) === i).join(" · ") || "—";
  }
  const options = catalog.map(row => ({
    value: row.code && resolve(row.code) === row ? row.code : row.id,
    label: label(row), search: String(row.data.controlRef || row.data.assetId || ""),
  }));
  return { options, resolve, label };
}
export type RiskRecordOptions = ReturnType<typeof riskRecordOptions>;
export function riskAssetCaption(value: unknown, catalog: RiskRecordOptions, tr: boolean) {
  return [...new Set(connectionValues(value).map(ref => {
    const row = catalog.resolve(ref);
    if (row) return catalog.label(row);
    return isLegacyTechnicalRecordId(ref) || /^[\da-f]{8}-[\da-f-]{27}$/i.test(ref)
      ? (tr ? "Bağlı varlık doğrulanamadı" : "Linked asset unavailable") : ref;
  }))].join(" / ");
}
export function riskTitle(row: ConnectedGrcRow) {
  let title = String(row.data.title || "").trim();
  for (const ref of [row.code, row.id].filter((key): key is string => Boolean(key))) {
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp("^" + escaped + "(?:\\s*[·:|–—]\\s*|\\s+-\\s+)", "i"), "")
      .replace(new RegExp("(?:\\s*[·|–—]\\s*|\\s+-\\s+)" + escaped + "$", "i"), "");
  }
  return title || "—";
}
