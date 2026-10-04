import type { ConnectedGrcRow } from './connected-grc-model';

/** Keep saved legacy values visible without silently resolving or rewriting them. */
export function linkedRecordOptions(rows: ConnectedGrcRow[], titleField: string, retained: string[], tr: boolean) {
  const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('tr-TR');
  const codeCounts = new Map<string, number>();
  const ids = new Map(rows.map(row => [normalize(row.id), row.id]));
  for (const row of rows) if (row.code) codeCounts.set(normalize(row.code), (codeCounts.get(normalize(row.code)) || 0) + 1);
  const options = rows.map(row => ({
    value: row.code && codeCounts.get(normalize(row.code)) === 1 && (!ids.has(normalize(row.code)) || ids.get(normalize(row.code)) === row.id) ? row.code : row.id,
    label: `${String(row.data[titleField] || row.code || row.id)} · ${row.code || row.id}`,
  }));
  for (const value of retained) {
    if (options.some(option => option.value === value)) continue;
    const matches = rows.filter(row => normalize(row.id) === normalize(value) || normalize(String(row.data[titleField] || '')) === normalize(value));
    const detail = matches.length > 1 ? (tr ? 'belirsiz bağlantı; kaydı yeniden seçin' : 'ambiguous link; select the record again')
      : matches.length === 1 ? String(matches[0].data[titleField] || value)
      : (tr ? 'bağlı kayıt bulunamadı' : 'linked record unavailable');
    options.push({ value, label: `${value} (${detail})` });
  }
  return options;
}
