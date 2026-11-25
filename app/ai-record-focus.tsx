"use client";
import './core-record-focus.css';
export type AiRecordFocusProps = { focusRef?: string; clearFocus?: () => void; lang?: 'tr' | 'en' };
export function AiRecordFocusBanner({ focusRef, clearFocus, lang='tr', loading, error, found, retry }: AiRecordFocusProps & {
  loading: boolean; error: boolean; found: boolean; retry: () => void;
}) {
  const tr=lang==='tr';
  if (!focusRef && !loading && !error) return null;
  return <div className="core-record-focus ai-record-focus" role="status" data-state={loading?'loading':error?'error':found?'found':'missing'}><div>
    {focusRef&&<><strong>{tr?'Seçili kayıt':'Selected record'}</strong><span>{focusRef}</span></>}
    {loading?<span>{tr?'Kayıtlar yükleniyor…':'Loading records…'}</span>:error?<span>{tr?'Kaynak yüklenemedi. Tekrar deneyin.':'Source could not be loaded. Try again.'}</span>:!found&&focusRef?<span>{tr?'Kayıt yüklenen listede bulunamadı veya erişilemiyor.':'Record is absent from the loaded list or inaccessible.'}</span>:null}
  </div>{error&&<button type="button" onClick={retry}>{tr?'Tekrar dene':'Retry'}</button>}{focusRef&&<button type="button" onClick={clearFocus}>{tr?'Tüm kayıtları göster':'Show all records'}</button>}</div>;
}
