export function qaPassword() {
  const value = process.env.FORNOST_QA_PASSWORD;
  if (!value || value.length < 20) throw new Error('Set FORNOST_QA_PASSWORD to the ephemeral local QA account password');
  return value;
}
