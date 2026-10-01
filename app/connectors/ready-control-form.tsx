"use client";

import { useState, type FormEvent } from 'react';
import { templatesForSource } from './control-templates';

type Source = { id: string; name: string; driver: string; config: Record<string, string>; enabled: boolean };
export default function ReadyControlForm({ sources, initialSourceId, lang, busy, message, onSave, onCancel }: {
  sources: Source[]; initialSourceId: string; lang: 'tr' | 'en'; busy: boolean; message: string;
  onSave: (body: Record<string, unknown>) => Promise<boolean>; onCancel: () => void;
}) {
  const tr = lang === 'tr', eligible = sources.filter(source => source.enabled && templatesForSource(source).length);
  const initial = eligible.find(source => source.id === initialSourceId) || eligible[0];
  const [sourceId, setSourceId] = useState(initial?.id || '');
  const source = eligible.find(item => item.id === sourceId), templates = source ? templatesForSource(source) : [];
  const [templateId, setTemplateId] = useState(initial ? templatesForSource(initial)[0].id : '');
  const template = templates.find(item => item.id === templateId);
  const [refs, setRefs] = useState(initial ? templatesForSource(initial)[0].suggestedRefs : '');
  const [schedule, setSchedule] = useState('daily'), [owner, setOwner] = useState('');
  const [freshness, setFreshness] = useState(48), [threshold, setThreshold] = useState(1), [dueDays, setDueDays] = useState(7), [autoFinding, setAutoFinding] = useState(true);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!template) return;
    if (await onSave({ action: 'save-template-rule', sourceId, templateId, name: template.name[lang], controlRefs: refs, schedule, remediationOwner: owner, freshnessHours: freshness, failureThreshold: threshold, remediationDueDays: dueDays, autoFinding })) onCancel();
  }
  return <form className="ea-form" onSubmit={submit}>
    {!eligible.length ? <p className="wide">{tr ? 'Önce Intune, Defender for Endpoint veya SonarQube kanıt kaynağı ekleyin.' : 'First add an Intune, Defender for Endpoint or SonarQube evidence source.'}</p> : <>
      <label>{tr ? 'Kanıt kaynağı' : 'Evidence source'}<select aria-label={tr ? 'Hazır kontrol kaynağı' : 'Ready control source'} required value={sourceId} onChange={event => {
        const next = eligible.find(item => item.id === event.target.value)!; const first = templatesForSource(next)[0];
        setSourceId(next.id); setTemplateId(first.id); setRefs(first.suggestedRefs);
      }}>{eligible.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>{tr ? 'Hazır test' : 'Ready test'}<select aria-label={tr ? 'Hazır test' : 'Ready test'} required value={templateId} onChange={event => { setTemplateId(event.target.value); setRefs(templates.find(item => item.id === event.target.value)!.suggestedRefs); }}>{templates.map(item => <option key={item.id} value={item.id}>{item.name[lang]}</option>)}</select></label>
      {template && <div className="wide connector-guide"><b>{template.name[lang]}</b><p>{template.description[lang]}</p><small>{tr ? 'Kapsam, bağlantı hesabının görebildiği kayıtlardır. Aşağıdaki eşlemeler öneridir; kurumunuzun kontrol kapsamını doğrulayın.' : 'Scope is limited to records visible to the connection account. Mappings below are suggestions; verify your organisation’s control scope.'}</small></div>}
      <label className="wide">{tr ? 'Bağlı kontrol/maddeler' : 'Mapped controls'}<input required maxLength={1000} value={refs} onChange={event => setRefs(event.target.value)}/></label>
      <label>{tr ? 'Zamanlama' : 'Schedule'}<select value={schedule} onChange={event => setSchedule(event.target.value)}>{['hourly', 'daily', 'weekly', 'monthly'].map((value, i) => <option key={value} value={value}>{tr ? ['Saatlik', 'Günlük', 'Haftalık', 'Aylık'][i] : ['Hourly', 'Daily', 'Weekly', 'Monthly'][i]}</option>)}</select></label>
      <label>{tr ? 'Düzeltme sahibi (boşsa siz)' : 'Remediation owner (you if blank)'}<input type="email" maxLength={200} value={owner} onChange={event => setOwner(event.target.value)}/></label>
      <details className="wide ea-template-options"><summary>{tr ? 'Gelişmiş ayarlar' : 'Advanced settings'}</summary><div>
        <label>{tr ? 'Kanıt tazeliği (saat)' : 'Evidence freshness (hours)'}<input type="number" min={1} max={8760} required value={freshness} onChange={event => setFreshness(Number(event.target.value))}/></label>
        <label>{tr ? 'Ardışık hata eşiği' : 'Consecutive failure threshold'}<input type="number" min={1} max={20} required value={threshold} onChange={event => setThreshold(Number(event.target.value))}/></label>
        <label>{tr ? 'Düzeltme süresi (gün)' : 'Remediation due (days)'}<input type="number" min={1} max={365} required value={dueDays} onChange={event => setDueDays(Number(event.target.value))}/></label>
        <label className="ea-check"><input type="checkbox" checked={autoFinding} onChange={event => setAutoFinding(event.target.checked)}/><span>{tr ? 'Eşik aşılınca bulgu ve risk oluştur' : 'Create finding and risk at threshold'}</span></label>
      </div></details>
    </>}
    {message && <p className="wide" role="status">{message}</p>}
    <footer><button type="button" className="ghost" onClick={onCancel}>{tr ? 'Vazgeç' : 'Cancel'}</button><button className="primary" disabled={busy || !template}>{tr ? 'Hazır Kontrolü Etkinleştir' : 'Enable Ready Control'}</button></footer>
  </form>;
}
