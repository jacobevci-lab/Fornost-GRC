export function safeSpreadsheetCell(value: unknown) {
  const text = String(value ?? "");
  return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
}
