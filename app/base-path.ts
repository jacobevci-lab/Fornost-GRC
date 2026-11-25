export function normalizeBasePath(value: string | undefined) {
  const configured = value?.trim() || "";
  if (!configured || configured === "/") return "";
  const normalized = configured.replace(/\/+$/, "");
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export const BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

export function withBasePath(path: string) {
  if (!path.startsWith("/")) return path;
  if (!BASE_PATH || path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
