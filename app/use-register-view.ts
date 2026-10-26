'use client';
import { useEffect, useRef, useState } from 'react';
import { emptyRegisterView, readRegisterView, writeRegisterView, registerViewKey, type RegisterView } from './register-view';
/** Per-user, per-module, per-tab context; query/filter preferences are separate from exact-record navigation hints. */
export function useRegisterView(userId: string, module: string) {
  const key = registerViewKey(userId, module);
  const cache = useRef<Record<string, RegisterView>>({});
  const [loaded, setLoaded] = useState<{ key: string; view: RegisterView } | null>(null);
  useEffect(() => {
    const view = cache.current[key] || readRegisterView(() => sessionStorage, key);
    cache.current[key] = view;
    setLoaded({ key, view });
  }, [key]);
  const view = loaded?.key === key ? loaded.view : emptyRegisterView();
  const update = (patch: Partial<RegisterView>) => {
    const next = { ...(cache.current[key] || readRegisterView(() => sessionStorage, key)), ...patch };
    cache.current[key] = next;
    writeRegisterView(() => sessionStorage, key, next);
    setLoaded({ key, view: next });
  };
  return { query: view.query, setQuery: (query: string) => update({ query }), filters: view.filters, setFilters: (filters: Record<string, string>) => update({ filters }) };
}
