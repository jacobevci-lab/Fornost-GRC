'use client';

import { useState } from 'react';
import { DirectoryPersonField } from '../directory-person-field';
import { PolicyEntityPicker } from '../policy-lifecycle/exception-fields';
import { governingRisk, blankProfile, parseProfile, word, DeskError, type Profile, type SystemRow } from '../ai/governance-domain';
export type Submit = (body: Record<string, unknown>) => Promise<boolean>;
export default function Registration({
  tr,
  code,
  row,
  name,
  shadowId,
  submit,
  busy,
  onError
}: {
  tr: boolean;
  code: string;
  row?: SystemRow;
  name?: string;
  shadowId?: string;
  submit: Submit;
  busy: boolean;
  onError: (code: string) => void;
}) {
  const [p, setP] = useState<Profile>(() => row?.profile ? {...row.profile,risk:governingRisk(row.profile.risk,row.nativeRisk)} : {
    ...blankProfile,
    risk: row?.nativeRisk || '',
    name: name || row?.name || '',
    model: row?.model || '',
    provider: row?.vendor || '',
    owner: row?.owner || '',
    purpose: row?.purpose || '',
    reviewDate: row?.reviewDate || ''
  });
  const set = <K extends keyof Profile,>(k: K, v: Profile[K]) => setP(old => ({
    ...old,
    [k]: v,
    ...((k === 'owner' || k === 'technical') && v === old.reviewer ? {
      reviewer: ''
    } : {})
  }));
  const t = (a: string, b: string) => tr ? a : b;
  const input = (k: keyof Profile, label: string, required = true, type = 'text', minLength = 0) => <label>
    {label}
    <input type={type} value={String(p[k])} required={required} minLength={minLength} onChange={e => set(k, e.target.value)} />
  </label>;
  const area = (k: keyof Profile, label: string, required = true, minLength = 0) => <label>
    {label}
    <textarea rows={2} value={String(p[k])} required={required} minLength={minLength} onChange={e => set(k, e.target.value)} />
  </label>;
  const select = (k: keyof Profile, label: string, options: string[]) => <label>
    {label}
    <select aria-label={label} required value={String(p[k])} onChange={e => set(k, e.target.value)}>
      <option value="">{t('Seçin', 'Choose')}</option>
      {options.map(v => <option value={v} key={v}>{word(v, tr)}</option>)}
    </select>
  </label>;
  const toggle = (k: 'write' | 'pii' | 'noTraining' | 'zdr' | 'transfer', label: string) => <label className="ag-check">
    <input type="checkbox" checked={p[k]} onChange={e => set(k, e.target.checked)} />
    {label}
  </label>;
  return <form className="ag-form" onSubmit={async e => {
    e.preventDefault();
    try {
      parseProfile(p);
    } catch (err) {
      onError(err instanceof DeskError ? err.code : 'fields');
      return;
    }
    await submit({
      action: 'register',
      profile: p,
      id: row?.id,
      revision: row?.revision,
      shadowId
    });
  }}>
    {row?.phase === 'production' && !row.profile && <p role="status">{t('Profil kaydedildiğinde önceki üretim onayı askıya alınır. Yeni profil bağımsız incelemeye gönderilebilir.', 'Saving the profile suspends the previous production approval. You can then submit the new profile for independent review.')}</p>}
    <fieldset>
      <legend>{t('A · Sistem kimliği, mimari ve tedarik zinciri', 'A · System identity, architecture and supply chain')}</legend>
      <div className="ag-grid">
        <label>
          {t('Sistem kodu', 'System code')}
          <input readOnly value={row?.code || code} />
        </label>
        {input('name', t('Sistem / Agent adı', 'System / agent name'), true, 'text', 3)}
        {input('model', t('Model / sürüm', 'Model / version'), true, 'text', 2)}
        {input('unit', t('İş birimi', 'Business unit'))}
        {area('purpose', t('Kullanım amacı', 'Intended purpose'), true, 10)}
        {select('architecture', t('Mimari türü', 'Architecture'), ['llm', 'agent', 'ml', 'embedded'])}
        {select('deployment', t('Dağıtım modeli', 'Deployment model'), ['private', 'cloud', 'saas'])}
        <PolicyEntityPicker kind="vendor" label={t('Model sağlayıcısı · VEN', 'Model provider · VEN')} tr={tr} values={p.vendor} onChange={v => set('vendor', v)} />
        {input('provider', t('Kayıt dışı sağlayıcı adı', 'Unregistered provider name'), !p.vendor.length)}
        <PolicyEntityPicker kind="asset" label={t('İlgili varlık · AST', 'Related asset · AST')} tr={tr} values={p.asset} onChange={v => set('asset', v)} />
      </div>
    </fieldset>
    <fieldset>
      <legend>{t('B · EU AI Act risk sınıfı ve agent yetkileri', 'B · EU AI Act risk class and agent permissions')}</legend>
      <div className="ag-grid">
 {select('risk', t('EU AI Act risk seviyesi', 'EU AI Act risk level'), ['minimal', 'limited', 'high', 'prohibited'])}
 {p.risk === 'prohibited' && <p role="status">{t('Bu sistem için üretim onayı kilitlidir.', 'Production approval is blocked for this system.')}</p>}
 {p.architecture === 'agent' && <>{area('tools', t('Erişilen araç / API kapsamı', 'Authorized tool / API scope'))}{toggle('write', t('Sistemlerde yazma / değişiklik yetkisi var', 'May write to or modify systems'))}</>}
 {area('hitl', t('İnsan döngüde (HITL) onay mekanizması', 'Human-in-the-loop (HITL) approval mechanism'), p.architecture === 'agent')}
 </div>
    </fieldset>
    <fieldset>
      <legend>{t('C · Veri sınırları, KVKK ve ZDR', 'C · Data boundaries, privacy and ZDR')}</legend>
      <p>{t('Veri kaynakları', 'Data sources')}</p>
      <div className="ag-grid">{['rag', 'pii', 'sensitive', 'code', 'public'].map(v => <label className="ag-check" key={v}>
          <input type="checkbox" checked={p.sources.includes(v)} onChange={e => setP(old => ({
            ...old,
            sources: e.target.checked ? [...old.sources, v] : old.sources.filter(x => x !== v),
            pii: old.pii || v === 'pii' && e.target.checked
          }))} />
          {word(v, tr)}
        </label>)}</div>
      {toggle('pii', t('Kişisel veri (PII) işliyor', 'Processes personal data (PII)'))}
      {toggle('noTraining', t('Sağlayıcı veriyi model eğitiminde kullanmıyor (opt-out)', 'Provider excludes data from model training (opt-out)'))}
      {toggle('zdr', t('Sağlayıcının sıfır veri saklama (ZDR) taahhüdü var', 'Provider has a zero data retention (ZDR) commitment'))}
      {toggle('transfer', t('Veri yurt dışına aktarılıyor (KVKK Madde 9)', 'Data transferred abroad (KVKK Article 9)'))}
    </fieldset>
    <fieldset>
      <legend>{t('D · Sorumlular ve Connected-GRC bağlantıları', 'D · Accountability and Connected-GRC links')}</legend>
      <div className="ag-grid">
        {(['owner', 'technical', 'reviewer'] as const).map((k, i) => <DirectoryPersonField key={k} tr={tr} label={(tr ? ['AI iş sahibi', 'Teknik / model sorumlusu', 'Bağımsız inceleyen (Admin)'] : ['AI business owner', 'Technical / model owner', 'Independent reviewer (Admin)'])[i]} value={p[k]} reviewer={k === 'reviewer'} exclude={k === 'reviewer' ? [p.owner, p.technical] : []} onChange={v => set(k, v)} />)}
        <PolicyEntityPicker kind="risk" multi tr={tr} label={t('Bağlı riskler · RSK', 'Linked risks · RSK')} values={p.risks} onChange={v => set('risks', v)} />
        <PolicyEntityPicker kind="control" multi tr={tr} label={t('Bağlı kontroller · CTL / ISO/IEC 42001', 'Linked controls · CTL / ISO/IEC 42001')} values={p.controls} onChange={v => set('controls', v)} />
        {input('reviewDate', t('Periyodik gözden geçirme tarihi', 'Periodic review date'), true, 'date')}
        {(['impact', 'likelihood', 'sensitivity', 'autonomy', 'maturity'] as const).map((k, i) => <div key={k}>{select(k, (tr ? ['Etki', 'Olasılık', 'Veri hassasiyeti', 'Otonomi riski', 'Kontrol olgunluğu'] : ['Impact', 'Likelihood', 'Data sensitivity', 'Autonomy risk', 'Control maturity'])[i] + ' (1–5)', ['1', '2', '3', '4', '5'])}</div>)}
        {area('controlNotes', t('Mevcut kontrol ve risk gerekçesi', 'Existing controls and risk rationale'), true, 5)}
      </div>
    </fieldset>
    <footer>
      <button className="ag-primary" disabled={busy}>{t('Sistem profilini kaydet', 'Save system profile')}</button>
    </footer>
  </form>;
}
