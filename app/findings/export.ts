/** Spreadsheet engines may ignore leading whitespace before a formula marker. */
export function findingCsvCell(value:unknown) {
 const raw=String(value??'');
 const safe=/^[\s]*[=+\-@]/.test(raw)?`'${raw}`:raw;
 return `"${safe.replace(/"/g,'""')}"`;
}
