/** Per-user, per-tab navigation. Storage is optional and never grants access. */
type PageStorage = Pick<Storage, "getItem" | "setItem">;
export const pageSessionKey = (userId: string) => `fornost-grc-page:v1:${encodeURIComponent(userId)}`;
export function restorePage(storage: () => PageStorage, key: string, allowed: (module: string) => boolean): string {
  try {
    const savedPage = storage().getItem(key);
    if (savedPage && savedPage.length <= 100 && allowed(savedPage)) return savedPage;
  } catch { /* Storage can be unavailable in restricted browsers. */ }
  return "Ana Sayfa";
}
export function rememberPage(storage: () => PageStorage, key: string, module: string): void {
  try { storage().setItem(key, module); } catch { /* Navigation still works without storage. */ }
}
