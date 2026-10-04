"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { consumePendingFornostFocus, peekPendingFornostFocus, FORNOST_FOCUS_EVENT, type FornostNavigationRequest } from './navigation-focus';
import { sameDomainModule } from './domain-identity';
import { enterpriseWorkKinds } from './enterprise-work';
import './core-record-focus.css';

export function useEnterpriseWorkFocus<T extends string>(module: string, setTab: Dispatch<SetStateAction<T>>) {
  const [focus, setFocus] = useState<{ kind: string; ref: string } | null>(null);
  useEffect(() => {
    const accept = (request: FornostNavigationRequest | null) => {
      if (!request || request.source !== 'my-work-enterprise' || !sameDomainModule(request.module, module) || !request.ref) return;
      const kind = request.kind || '', definition = enterpriseWorkKinds[kind];
      if (!definition || definition.module !== module) return;
      setFocus({ kind, ref: request.ref }); setTab(definition.tab as T);
      consumePendingFornostFocus(module);
    };
    accept(peekPendingFornostFocus());
    const listener = (event: Event) => accept((event as CustomEvent<FornostNavigationRequest>).detail);
    window.addEventListener(FORNOST_FOCUS_EVENT, listener);
    return () => window.removeEventListener(FORNOST_FOCUS_EVENT, listener);
  }, [module, setTab]);
  return { focus, clear: () => setFocus(null), matches: (kind: string, id: string) => !focus || focus.kind !== kind || focus.ref === id };
}

export function EnterpriseWorkFocusBanner({ focus, found, ready, clear, tr }: {
  focus: { kind: string; ref: string } | null; found: boolean; ready: boolean; clear: () => void; tr: boolean;
}) {
  if (!focus) return null;
  return <div className="core-record-focus enterprise-work-focus" role="status"><div>
    <strong>{enterpriseWorkKinds[focus.kind]?.[tr ? 'tr' : 'en']}</strong><span>{focus.ref}</span>
    {!found && <span>{!ready ? (tr ? 'Kaynak henüz doğrulanamadı.' : 'Source not yet verified.') : (tr ? 'Kayıt bulunamadı veya erişilemiyor.' : 'Record unavailable or inaccessible.')}</span>}
  </div><button type="button" onClick={clear}>{tr ? 'Tüm kayıtları göster' : 'Show all records'}</button></div>;
}
