"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { navigateToFornost, consumePendingFornostFocus, peekPendingFornostFocus, FORNOST_FOCUS_EVENT, type FornostNavigationRequest } from './navigation-focus';
import { sameDomainModule } from './domain-identity';
import { enterpriseWorkKinds } from './enterprise-work';
import './core-record-focus.css';

type WorkFocus = { kind: string; ref: string; fromMyWork?: boolean };

export function useEnterpriseWorkFocus<T extends string>(module: string, setTab: Dispatch<SetStateAction<T>>, onFocus?: () => void) {
  const [focus, setFocus] = useState<WorkFocus | null>(null);
  useEffect(() => {
    const accept = (request: FornostNavigationRequest | null) => {
      if (!request || !['my-work-enterprise', 'global-search', 'shared-record-link', 'evidence-usage'].includes(request.source || '') || !sameDomainModule(request.module, module) || !request.ref) return;
      const kind = request.kind || '', definition = enterpriseWorkKinds[kind];
      if (!definition || definition.module !== module) return;
      setFocus({ kind, ref: request.ref, fromMyWork: request.source === "my-work-enterprise" }); setTab(definition.tab as T); onFocus?.();
      consumePendingFornostFocus(module);
    };
    accept(peekPendingFornostFocus());
    const listener = (event: Event) => accept((event as CustomEvent<FornostNavigationRequest>).detail);
    window.addEventListener(FORNOST_FOCUS_EVENT, listener);
    return () => window.removeEventListener(FORNOST_FOCUS_EVENT, listener);
  }, [module, setTab, onFocus]);
  return { focus, open: (kind:string,ref:string) => {const definition=enterpriseWorkKinds[kind];if(definition?.module===module){setFocus({kind,ref});setTab(definition.tab as T);onFocus?.()}}, clear: () => setFocus(null), matches: (kind: string, id: string) => !focus || focus.kind !== kind || focus.ref === id };
}

export function EnterpriseWorkFocusBanner({ focus, found, ready, clear, tr }: {
  focus: WorkFocus | null; found: boolean; ready: boolean; clear: () => void; tr: boolean;
}) {
  if (!focus) return null;
  return <div className="core-record-focus enterprise-work-focus" role="status"><div>
    <strong>{enterpriseWorkKinds[focus.kind]?.[tr ? 'tr' : 'en']}</strong><span>{focus.ref}</span>
    {!found && <span>{!ready ? (tr ? 'Kaynak henüz doğrulanamadı.' : 'Source not yet verified.') : (tr ? 'Kayıt bulunamadı veya erişilemiyor.' : 'Record unavailable or inaccessible.')}</span>}
  </div><div>
    {focus.fromMyWork && <button type="button" onClick={() => navigateToFornost("Benim İşlerim")}>{tr ? "İş listeme dön" : "Back to My Work"}</button>}
    <button type="button" onClick={clear}>{tr ? 'Tüm kayıtları göster' : 'Show all records'}</button></div></div>;
}
