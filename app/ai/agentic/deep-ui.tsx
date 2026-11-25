'use client';
import { useEffect, useState } from 'react';
import { Notice, useOperation, FileField } from '../grc/ui-common';
import { agentApi, agentMessage } from './ui-shared';
import { blankWizard, options, classifyWizard, legalSources, type Wizard, type Bom, type Discovery } from './deep-domain';
import type { SystemRow } from '../governance-domain';
type Extension = {
    revision: string;
    wizard: (ReturnType<typeof classifyWizard> & {
        governingRisk?: string;
    }) | null;
    bom: Bom | null;
};
const blankBom: Bom = { model: '', modelVersion: '', provider: '', vectorStore: '', dataBoundary: 'unknown', tools: [] };
const riskLabel = (risk: string, tr: boolean) => ({ prohibited: tr ? 'Yasak uygulama' : 'Prohibited practice', high: tr ? 'Yüksek risk' : 'High risk', limited: tr ? 'Şeffaflık yükümlülükleri' : 'Transparency obligations', minimal: tr ? 'Asgari risk' : 'Minimal risk', unresolved: tr ? 'Uzman incelemesi gerekli' : 'Expert review required' }[risk] || risk);
export function DeepGovernanceTools({ m, tr, user, reload }: {
    m: SystemRow;
    tr: boolean;
    user: {
        email: string;
        role: string;
    };
    reload: () => Promise<unknown>;
}) {
    const lang = tr ? 'tr' : 'en', t = (a: string, b: string) => tr ? a : b, op = useOperation(lang), [data, setData] = useState<Extension | null>(null), [wizard, setWizard] = useState<Wizard>(blankWizard), [bom, setBom] = useState<Bom>({ ...blankBom, model: m.model }), [step, setStep] = useState(0), [showWizard, setShowWizard] = useState(false), [editBom, setEditBom] = useState(false);
    useEffect(() => { let active = true; agentApi(undefined, '?id=' + encodeURIComponent(m.id), true).then(d => { if (active) {
        setData(d);
        setWizard(d.wizard?.answers || blankWizard);
        setBom(d.bom || { ...blankBom, model: m.model });
    } }).catch(e => { if (active)
        op.setNotice(agentMessage(e, lang)); }); return () => { active = false; }; }, [m.id, m.revision]); // eslint-disable-line react-hooks/exhaustive-deps
    const editable = user.role === 'Admin' || user.email === m.owner;
    const ready = !!data && editable && !['retired', 'review'].includes(m.phase);
    async function save(body: Record<string, unknown>) { try {
        const r = await agentApi({ ...body, id: m.id, modelRevision: m.revision, revision: data?.revision, lang }, '', true);
        setData(r);
        await reload();
        op.setNotice(t('Kaydedildi; bağımsız üretim onayı yeniden gerekir.', 'Saved; independent production approval is required again.'));
        setShowWizard(false);
        setEditBom(false);
    }
    catch (e) {
        op.setNotice(agentMessage(e, lang));
    } }
    const select = (key: Exclude<keyof Wizard, 'uses' | 'rationale'>, label: string) => <label>{label}<select aria-label={label} value={wizard[key]} onChange={e => setWizard({ ...wizard, [key]: e.target.value })}><option value="">{t('Seçin', 'Choose')}</option>{options[key].map(v => <option key={v[0]} value={v[0]}>{v[tr ? 1 : 2]}</option>)}</select></label>;
    const result = data?.wizard ? { ...classifyWizard(data.wizard.answers, tr, data.wizard.asOf), completed: data.wizard.completed, governingRisk: data.wizard.governingRisk } : null;
    return <section className="grc-ai"><header><span className="agent-eyebrow">{m.code} · AI GOVERNANCE</span><h3>{t('Sınıflandırma ve Agent Yetki Haritası', 'Classification and Agent Permission Map')}</h3></header><Notice {...op} lang={lang}/><div className="grc-ai-actions"><button disabled={!ready || op.busy} onClick={() => { setShowWizard(!showWizard); setStep(0); }}>{t('EU AI Act · 5 Soruluk Sihirbaz', 'EU AI Act · 5-Question Wizard')}</button><button disabled={!ready || op.busy} onClick={() => setEditBom(!editBom)}>{t('AI BOM düzenle', 'Edit AI BOM')}</button></div><p className="grc-ai-note">{t('Sınıflandırma ön değerlendirmedir. Kapsam ve istisnalar uzman tarafından doğrulanır. Kaydedilen değişiklik üretim onayını sıfırlar.', 'Classification is preliminary. An expert verifies scope and exceptions. Saving a change resets production approval.')}</p>
 {showWizard && <div className="agent-wizard"><nav className="agent-wizard-progress" aria-label={t('Sihirbaz adımları', 'Wizard steps')}>{[0, 1, 2, 3, 4].map(i => <button key={i} aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}>{i + 1}</button>)}</nav><h4>{[t('1. Kapsam ve yasak uygulamalar', '1. Scope and prohibited practices'), t('2. Amaçlanan kullanım', '2. Intended use'), t('3. Ürün güvenliği', '3. Product safety'), t('4. Kararlara etki', '4. Decision impact'), t('5. Şeffaflık ve kurumun rolü', '5. Transparency and organisational role')][step]}</h4>
 {step === 0 && <>{select('scope', t('AB kapsamı', 'EU applicability'))}{select('prohibited', t('Yasak uygulama taraması', 'Prohibited practice screening'))}<small>{t('Birden çok durum varsa yasak uygulamayı seçin; istisna veya belirsizlik varsa uzman incelemesi gerekir.', 'If multiple apply, select the prohibited practice; exceptions and unknowns require expert review.')}</small></>}
 {step === 1 && <fieldset><legend>{t('Uygun kullanım alanlarını seçin', 'Select applicable use cases')}</legend>{options.uses.map(v => <label className="grc-ai-check" key={v[0]}><input aria-label={v[tr ? 1 : 2]} type="checkbox" checked={wizard.uses.includes(v[0])} onChange={e => setWizard({ ...wizard, uses: e.target.checked ? ['none', 'unknown'].includes(v[0]) ? [v[0]] : [...wizard.uses.filter(x => !['none', 'unknown'].includes(x)), v[0]] : wizard.uses.filter(x => x !== v[0]) })}/>{v[tr ? 1 : 2]}</label>)}</fieldset>}
 {step === 2 && <>{select('product', t('Ek I koşulları birlikte karşılanıyor mu?', 'Are the Annex I conditions met together?'))}<p>{t('Yalnız güvenlik dışı kolaylık / optimizasyon, tek başına güvenlik bileşeni değildir. Hata sağlık veya güvenliği tehlikeye atıyorsa uzman değerlendirmesi gerekir.', 'Non-safety convenience / optimisation alone is not a safety component. Failure affecting health or safety requires expert assessment.')}</p></>}
 {step === 3 && <>{select('effect', t('Karar etkisi / gerçek kişi profillemesi', 'Decision influence / profiling natural persons'))}<label>{t('Gerekçe ve istisna dayanağı', 'Rationale and exemption basis')}<textarea aria-label={t('Gerekçe ve istisna dayanağı', 'Rationale and exemption basis')} maxLength={2000} value={wizard.rationale} onChange={e => setWizard({ ...wizard, rationale: e.target.value })}/></label></>}
 {step === 4 && <>{select('interaction', t('Kullanıcı etkileşimi / üretilen içerik', 'User interaction / generated content'))}{select('role', t('Kurumun rolü', 'Organisational role'))}</>}
 <div className="grc-ai-actions"><button disabled={step === 0} onClick={() => setStep(n => n - 1)}>{t('Önceki', 'Previous')}</button>{step < 4 ? <button onClick={() => setStep(n => n + 1)}>{t('Sonraki', 'Next')}</button> : <button className="primary" disabled={op.busy} onClick={() => void op.run(() => save({ action: 'wizard', answers: wizard }))}>{t('Sınıflandır ve kontrol listesini ata', 'Classify and assign checklist')}</button>}</div></div>}
 {result && <div className="agent-answer"><h4>{riskLabel(result.risk, tr)}</h4>{result.governingRisk && result.governingRisk !== result.risk && <p>{t('Mevcut daha yüksek sınıf korundu', 'Existing higher classification retained')}: {riskLabel(result.governingRisk, tr)}</p>}{result.needsReview && <p className="agent-danger">{t('Belirsizlik / istisna çözülmeden üretim onayı verilemez.', 'Production approval is blocked until uncertainty / exceptions are resolved.')}</p>}{result.completed.length<result.checklist.length&&<p className="grc-ai-note">{t('Kontrol listesi tamamlanmadan üretim onayı verilemez.','Production approval is blocked until the checklist is complete.')}</p>}<small>{t('Kural sürümü', 'Rule version')}: {result.ruleVersion} · {t('Değerlendirme', 'Assessment')}: {result.asOf}</small><ul className="agent-checklist">{result.checklist.map(c => <li key={c.key}><label className="grc-ai-check"><input type="checkbox" checked={result.completed.includes(c.key)} disabled={!ready || op.busy} onChange={e => void op.run(() => save({ action: 'checklist', completed: e.target.checked ? [...result.completed, c.key] : result.completed.filter(k => k !== c.key) }))}/><span>{c.title}<br /><small>{c.basis} · {c.applicability === 'required' ? t('Sınıfa / role bağlı yükümlülük', 'Class / role obligation') : t('Uygulanabilirlik incelemesi', 'Applicability review')}</small></span></label></li>)}</ul><div className="agent-legal">{legalSources.map(url => <a key={url} href={url} target="_blank" rel="noreferrer">{url.split('/').pop()}</a>)}</div></div>}
 {editBom && <form onSubmit={e => { e.preventDefault(); void op.run(() => save({ action: 'bom', bom })); }}><div className="grc-ai-grid">{(['model', 'modelVersion', 'provider', 'vectorStore'] as const).map((k, i) => <label key={k}>{[t('Temel model', 'Base model'), t('Model sürümü', 'Model version'), t('Sağlayıcı', 'Provider'), t('Vektör veritabanı (yoksa belirtin)', 'Vector database (state if none)')][i]}<input aria-label={[t('Temel model', 'Base model'), t('Model sürümü', 'Model version'), t('Sağlayıcı', 'Provider'), t('Vektör veritabanı (yoksa belirtin)', 'Vector database (state if none)')][i]} required={k === 'model'} value={bom[k]} maxLength={300} onChange={e => setBom({ ...bom, [k]: e.target.value })}/></label>)}<label>{t('Veri sınırı', 'Data boundary')}<select aria-label={t('Veri sınırı', 'Data boundary')} value={bom.dataBoundary} onChange={e => setBom({ ...bom, dataBoundary: e.target.value as Bom['dataBoundary'] })}>{['local', 'cloud', 'hybrid', 'unknown'].map((v, i) => <option value={v} key={v}>{[t('Yerel', 'Local'), t('Bulut', 'Cloud'), t('Karma', 'Hybrid'), t('Bilinmiyor', 'Unknown')][i]}</option>)}</select></label></div>
 {bom.tools.map((tool, i) => <fieldset className="agent-card" key={tool.id}><legend>{t('Araç', 'Tool')} {i + 1}</legend><div className="grc-ai-grid">{(['name', 'scope', 'hitl'] as const).map((key, j) => <label key={key}>{[t('MCP / API adı', 'MCP / API name'), t('Yetki kapsamı / kaynaklar', 'Permission scope / resources'), t('HITL kesme noktası (yoksa boş bırakın)', 'HITL checkpoint (leave empty if absent)')][j]}<input aria-label={[t('MCP / API adı', 'MCP / API name'), t('Yetki kapsamı / kaynaklar', 'Permission scope / resources'), t('HITL kesme noktası (yoksa boş bırakın)', 'HITL checkpoint (leave empty if absent)')][j]} required={key !== 'hitl'} value={tool[key]} maxLength={800} onChange={e => setBom({ ...bom, tools: bom.tools.map((r, n) => n === i ? { ...r, [key]: e.target.value } : r) })}/></label>)}<label>{t('Araç türü', 'Tool type')}<select aria-label={t('Araç türü', 'Tool type')} value={tool.kind} onChange={e => setBom({ ...bom, tools: bom.tools.map((r, n) => n === i ? { ...r, kind: e.target.value as 'mcp' | 'api' } : r) })}><option value="mcp">MCP</option><option value="api">API</option></select></label><label>{t('Yetki seviyesi', 'Permission level')}<select aria-label={t('Yetki seviyesi', 'Permission level')} value={tool.permission} onChange={e => setBom({ ...bom, tools: bom.tools.map((r, n) => n === i ? { ...r, permission: e.target.value as Bom['tools'][0]['permission'] } : r) })}>{['none', 'read', 'write', 'admin'].map((v, j) => <option value={v} key={v}>{[t('Yok', 'None'), t('Okuma', 'Read'), t('Yazma / değişiklik', 'Write / modify'), t('Yönetici', 'Admin')][j]}</option>)}</select></label></div><button type="button" onClick={() => setBom({ ...bom, tools: bom.tools.filter((_, n) => n !== i) })}>{t('Aracı kaldır', 'Remove tool')}</button></fieldset>)}<div className="grc-ai-actions"><button type="button" disabled={bom.tools.length >= 30} onClick={() => setBom({ ...bom, tools: [...bom.tools, { id: crypto.randomUUID(), name: '', kind: 'mcp', permission: 'read', scope: '', hitl: '' }] })}>{t('+ Araç ekle', '+ Add tool')}</button><button className="primary" disabled={op.busy}>{t('AI BOM kaydet', 'Save AI BOM')}</button></div></form>}
 {data?.bom && <><div className="agent-map" aria-label={t('AI BOM yetki haritası', 'AI BOM permission map')}><section><small>{t('TEMEL MODEL', 'BASE MODEL')}</small><h4>{data.bom.model}</h4><p>{data.bom.modelVersion || '—'} · {data.bom.provider || '—'}</p></section><section><small>{t('VERİ KATMANI', 'DATA LAYER')}</small><h4>{data.bom.vectorStore || t('Belirtilmedi', 'Not specified')}</h4><p>{{local:t('Yerel','Local'),cloud:t('Bulut','Cloud'),hybrid:t('Karma','Hybrid'),unknown:t('Bilinmiyor','Unknown')}[data.bom.dataBoundary]}</p></section><section><small>MCP / API → HITL</small>{!data.bom.tools.length && <p>{t('Bağlı araç tanımlanmadı.', 'No connected tools declared.')}</p>}{data.bom.tools.map(tool => <article key={tool.id}><b>{tool.name}</b><p>{tool.kind.toUpperCase()} · {{none:t('Yetki yok','No permission'),read:t('Okuma','Read'),write:t('Yazma / değişiklik','Write / modify'),admin:t('Yönetici','Admin')}[tool.permission]}</p><p>{tool.scope}</p><strong className={!tool.hitl && ['write', 'admin'].includes(tool.permission) ? 'agent-danger' : ''}>{tool.hitl || t('HITL noktası belirtilmedi', 'No HITL checkpoint declared')}</strong></article>)}</section></div><p className="grc-ai-note">{t('Beyan edilen mimari ve yetki haritası; araç çalıştırmaz veya gerçek MCP izinlerini doğrulamaz. HITL olmadan yazma yetkisi üretim onayını engeller.', 'Declared architecture and permissions; does not execute tools or verify actual MCP grants. Write access without HITL blocks production approval.')}</p></>}
 </section>;
}
export function ShadowImport({ tr, reload }: {
    tr: boolean;
    reload: () => Promise<unknown>;
}) {
    const lang = tr ? 'tr' : 'en', t = (a: string, b: string) => tr ? a : b, op = useOperation(lang), [open, setOpen] = useState(false), [source, setSource] = useState('entra'), [csv, setCsv] = useState(''), [preview, setPreview] = useState<{
        id?: string;
        headers: string[];
        needsMapping: boolean;
        scanned: number;
        candidates: (Discovery & {
            status: string;
        })[];
    } | null>(null), [keys, setKeys] = useState<string[]>([]), [mapping, setMapping] = useState<Record<string, number>>({});
    async function analyze() { try {
        const d = await agentApi({ action: 'shadow-preview', source, csv, mapping,lang }, '', true);
        setPreview(d);
        setKeys(d.candidates.filter((c: Discovery) => c.status === 'unapproved').map((c: Discovery) => c.key));
    }
    catch (e) {
        op.setNotice(agentMessage(e, lang));
    } }
    return <section className="grc-ai"><button aria-expanded={open} onClick={() => setOpen(!open)}>{t('Shadow AI Keşif İçe Aktarımı', 'Import Shadow AI Discovery')}</button>{open && <><p>{t('Entra ID / Okta OAuth, ağ veya harcama CSV dışa aktarımını inceleyin. Sinyaller onaylı envanterle ad bazında karşılaştırılır; insan incelemesi gerekir.', 'Review Entra ID / Okta OAuth, network or spend CSV exports. Signals are compared by name with approved inventory; human review is required.')}</p><label>{t('Veri kaynağı', 'Data source')}<select aria-label={t('Veri kaynağı', 'Data source')} value={source} onChange={e => { setSource(e.target.value); setPreview(null); }}>{[['entra', 'Entra ID OAuth'], ['okta', 'Okta OAuth'], ['network', t('Ağ', 'Network')], ['spend', t('Harcama', 'Spend')]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><FileField lang={lang} label={t('CSV · en fazla 2 MB / 1.000 satır', 'CSV · maximum 2 MB / 1,000 rows')} accept=".csv,text/csv" disabled={op.busy} onFile={file => void op.run(async () => { if (file.size > 2000000) {
            op.setNotice(agentMessage(new Error('AI_LIMIT'), lang));
            return;
        } setCsv(await file.text()); setMapping({}); setPreview(null); })}/><button disabled={op.busy || !csv} onClick={() => void op.run(analyze)}>{t('Adayları önizle', 'Preview candidates')}</button><Notice {...op} lang={lang}/>
 {preview?.needsMapping && <><h4>{t('CSV sütunlarını eşleyin', 'Map CSV columns')}</h4>{['name', 'identity', 'domain', 'permissions'].map((k, i) => <label key={k}>{[t('Uygulama adı', 'Application name'), t('Uygulama kimliği', 'Application ID'), t('Alan adı / URL', 'Domain / URL'), t('OAuth izinleri', 'OAuth permissions')][i]}<select aria-label={[t('Uygulama adı', 'Application name'), t('Uygulama kimliği', 'Application ID'), t('Alan adı / URL', 'Domain / URL'), t('OAuth izinleri', 'OAuth permissions')][i]} value={mapping[k] ?? -1} onChange={e => setMapping({ ...mapping, [k]: Number(e.target.value) })}><option value={-1}>—</option>{preview.headers.map((h, j) => <option key={j} value={j}>{h}</option>)}</select></label>)}</>}
 {preview && !preview.needsMapping && <><p>{preview.scanned} {t('satır tarandı', 'rows scanned')} · {preview.candidates.length} {t('aday bulundu', 'candidates found')}</p><small>{t('Katalog ve ad/alan adı sinyalleri kullanılır. Sinyal bulunmaması, Shadow AI olmadığı anlamına gelmez. Aynı adın farklı bir uygulamayı temsil edebileceğini doğrulayın.', 'Uses catalogue and name/domain signals. No matches does not prove the absence of Shadow AI. Verify that identical names refer to the same application.')}</small><div className="agent-table"><table><thead><tr>{[t('Seç', 'Select'), t('Araç / kaynak satır', 'Tool / source row'), t('Sinyal ve izinler', 'Signal and permissions'), t('Durum', 'Status')].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{preview.candidates.map(c => <tr key={c.key}><td><input type="checkbox" aria-label={c.name} disabled={c.status === 'already-discovered'} checked={keys.includes(c.key)} onChange={e => setKeys(e.target.checked ? [...keys, c.key] : keys.filter(k => k !== c.key))}/></td><td><b>{c.name}</b><p>{c.domain}</p><small>{t('Satır', 'Row')} {c.row}</small></td><td>{c.reason === 'catalog' ? t('Bilinen AI katalog sinyali', 'Known AI catalogue signal') : t('AI anahtar sözcük sinyali', 'AI keyword signal')}<p>{c.permissions || '—'}</p></td><td>{c.status === 'inventory-match' ? t('Onaylı ad eşleşmesi — doğrulayın', 'Approved name match — verify') : c.status === 'already-discovered' ? t('Zaten keşfedildi', 'Already discovered') : t('İnceleme gerekli', 'Needs review')}</td></tr>)}</tbody></table></div><button className="primary" disabled={op.busy || !keys.length} onClick={() => void op.run(async () => { try {
            const r = await agentApi({ action: 'shadow-import', id: preview.id, keys }, '', true);
            await reload();
            setKeys([]);
            setPreview(null);
            op.setNotice(`${r.added} ${t('kayıt keşif kuyruğuna eklendi', 'records added to discovery queue')}; ${r.skipped} ${t('tekrar atlandı', 'duplicates skipped')}.`);
        }
        catch (e) {
            op.setNotice(agentMessage(e, lang));
        } })}>{t('Seçilenleri keşif kuyruğuna aktar', 'Import selected to discovery queue')} ({keys.length})</button></>}
 </>}</section>;
}
