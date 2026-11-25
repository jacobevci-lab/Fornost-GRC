"use client";
import { useMemo, useState, type ReactNode } from 'react';
import NavIcon from './nav-icon';
import { recoveryHoursLabel } from './bia-recovery';
import { connectedTitle, connectedRelationLabels, type ConnectedGrcRow as Row, type ConnectedGrcLink as Link } from './connected-grc-model';
import { connectedNeighborhood, issueLabels, recordOwner, recordMatches, type WorkbenchIssue, type ReachableRecord } from './connected-grc-workbench-model';
import { type AccessSubject } from './module-access';
import {MapCanvas} from './connected-map-canvas';
import {mapCode,mapTitle,arrowText} from './connected-map-model';
import MapDrawer from './connected-map-drawer';
import MapInspector from './connected-map-inspector';
import {linkChoices} from './connected-map-links';
import ConnectedLinkEditor from './connected-grc-link-editor';
import './connected-grc-workbench.css';

type Props = {
  tabs:ReactNode;openInventory:()=>void;network:'all'|'focus';setNetwork:(v:'all'|'focus')=>void;metric:'all'|'links'|'gaps'|'hubs';networkRows:Row[];
  rows: Row[]; links: Link[]; issues: WorkbenchIssue[]; selected?: Row; view: 'explore' | 'impact' | 'gaps'; lang: 'tr' | 'en'; actor: AccessSubject & { email: string };
  complete: boolean; loading: boolean; select: (row: Row) => void; openRecord: (row: Row) => void; moduleLabel: (module: string) => string; refresh: () => Promise<boolean>;
  issueQuery: string; setIssueQuery: (value: string) => void; issueType: string; setIssueType: (value: string) => void; issueModule: string; setIssueModule: (value: string) => void;
  query: string; setQuery: (value: string) => void; module: string; setModule: (value: string) => void; modules: string[]; visible: Row[]; matchingCount: number; page: number; setPage: (value: number) => void; exportLinks: () => void;
};

export default function ConnectedWorkbench(p: Props) {
  const { rows, links, issues, selected, view, lang, actor, complete, loading, select, openRecord, moduleLabel, issueQuery, setIssueQuery, issueType, setIssueType, issueModule, setIssueModule } = p, tr = lang === 'tr', language = tr ? 0 : 1;
  const [display, setDisplay] = useState<'diagram' | 'list'>('diagram'), [inspectId, setInspectId] = useState('');
  const [editor, setEditor] = useState<{row:Row;issue?:WorkbenchIssue}|null>(null), [issueId, setIssueId] = useState(''), [mine, setMine] = useState(false), [issueLimit, setIssueLimit] = useState(30), [impactType, setImpactType] = useState('all');
  const [drawerId,setDrawerId]=useState(''),[picker,setPicker]=useState(false),[toolsOpen,setToolsOpen]=useState(false);
  const drawerRow=rows.find(row=>row.id===drawerId);
  function showDetails(row:Row){setPicker(false);setToolsOpen(false);setDrawerId(row.id)}
  const [edgePage,setEdgePage]=useState(0);
  const [previousSelection, setPreviousSelection] = useState(selected?.id);
  if (previousSelection !== selected?.id) { setPreviousSelection(selected?.id); setInspectId(''); }
  const neighborhood = useMemo(() => selected ? connectedNeighborhood(selected, links, view === 'impact' ? 3 : 1, 30) : { records: [], links: [], truncated: false }, [selected, links, view]);
  const inspect = neighborhood.records.find(item => item.row.id === inspectId);
  const inspected = inspect?.row || selected;
  const visibleIds = new Set([selected?.id, ...neighborhood.records.map(item => item.row.id)]);
  const attention = issues.filter(item => inspect ? item.row.id === inspected?.id : visibleIds.has(item.row.id));
  const filteredIssues = issues.filter(issue => recordMatches(issue.row, issueQuery, lang) && (issueType === 'all' || issue.kind === issueType || issue.severity === issueType) && (issueModule === 'all' || issue.row.module === issueModule) && (!mine || recordOwner(issue.row).toLowerCase() === actor.email.toLowerCase()));
  const activeIssue = filteredIssues.find(issue => issue.id === issueId) || filteredIssues[0];
  const impacted = neighborhood.records.filter(item => impactType === 'all' || (impactType === 'business' ? ['BIA', 'İş Sürekliliği'].includes(item.row.module) : ['Risk Assessment', 'Kontroller', 'Kanıtlar'].includes(item.row.module)));
  const label = (relation: string) => connectedRelationLabels[relation]?.[lang] || relation;
  const startEditor = (row:Row,issue?:WorkbenchIssue)=>setEditor({row,issue});
  function exportImpact() {
    if (!selected) return;
    const data = [[tr ? 'Kapsam' : 'Scope', complete ? 'loaded' : 'partial', new Date().toISOString()], ['Root', mapCode(selected), connectedTitle(selected)], ['Traversal', '3 steps', '30 records', neighborhood.truncated ? 'truncated' : 'complete', impactType], ['Record', 'Title', 'Module', 'Steps', 'Owner', 'Path'], ...impacted.map(item => [item.row.code || item.row.id, connectedTitle(item.row), moduleLabel(item.row.module), item.depth, recordOwner(item.row), item.path.map(edge => `${edge.source.code || edge.source.id} — ${label(edge.relation)} → ${edge.target.code || edge.target.id}`).join(' / ')])];
    downloadCsv('fornost-impact.csv', data);
  }
  function exportIssues() {
    const metadata = [complete ? 'loaded' : 'partial', new Date().toISOString(), issueQuery, issueModule, issueType];
    const exported: unknown[][] = filteredIssues.map(issue => [issue.row.code || issue.row.id, connectedTitle(issue.row), issue.row.module, issue.kind, issue.severity, recordOwner(issue.row), issue.due || '', issue.detail || '', JSON.stringify(issue.candidates?.map(row => ({ id: row.id, code: row.code, title: connectedTitle(row) })) || []), ...metadata]);
    if (!exported.length) exported.push([...Array(9).fill(''), ...metadata]);
    downloadCsv(complete ? 'fornost-connected-grc-gaps.csv' : 'fornost-connected-grc-gaps-partial.csv', [['Record', 'Title', 'Module', 'Issue', 'Priority', 'Owner', 'Due', 'Reference', 'Candidates', 'Scope', 'Exported at', 'Query', 'Module filter', 'Type filter'], ...exported]);
  }
  const editorView = editor && <ConnectedLinkEditor key={'editor:'+editor.row.id} row={editor.row} rows={rows} links={links} actor={actor} lang={lang} issue={editor.issue} moduleLabel={moduleLabel} refresh={p.refresh} close={() => setEditor(null)} openRecord={openRecord}/>;
  const sourceNotice = !complete && <p className="cgw-warning" role="status">{loading ? (tr ? 'Kaynaklar yükleniyor. Bağlantı ve eksik değerlendirmesi bekleniyor.' : 'Sources are loading. Relationship and gap assessment is pending.') : (tr ? 'Kaynaklar eksik. Görünen ilişkiler ve eksikler kısmi; yokluk sonucu kesin değildir.' : 'Sources are incomplete. Visible relationships and gaps are partial; absence is not conclusive.')}</p>;
  const recordHeader = selected && <div className="cgw-record-heading"><NavIcon module={selected.module}/><div><h3>{connectedTitle(selected)}</h3><small>{mapCode(selected)} · {moduleLabel(selected.module)}</small></div><div className="cgw-owner"><small>{tr ? 'Sorumlu' : 'Owner'}</small><b>{recordOwner(selected)}</b></div></div>;
  const nextAction=(issue:WorkbenchIssue,inline=false)=>{
    const options=linkChoices(issue.row,actor,p.modules);
    const canLink=options.length>0;
    if(canLink)return <button type="button" onClick={()=>startEditor(issue.row,issue)}>{inline?(tr?'+ Bağla':'+ Link'):(tr?'Bağlantı ekle':'Add relationship')}</button>;
    return <button type="button" onClick={()=>openRecord(issue.row)}>{tr?'Kaydı incele':'Review record'}</button>;
  };
  const identity = (row: Row) => <><NavIcon module={row.module}/><span><small>{mapCode(row)}</small><b>{mapTitle(row,tr)}</b></span></>;
  const pathView = (item: ReachableRecord) => <ol className="cgw-path">{item.path.map((edge, i) => <li key={`${edge.source.id}:${edge.target.id}:${edge.field}:${i}`}><b>{connectedTitle(edge.source)}</b><span>{label(edge.relation)} →</span><b>{connectedTitle(edge.target)}</b><small>{tr ? 'Kaynak alan' : 'Source field'}: {edge.field}</small></li>)}</ol>;
  const inspectView = inspected && <aside className="cgw-inspector"><h3>{view === 'impact' ? (tr ? 'Neden listede?' : 'Why is this listed?') : (tr ? 'Kayıt ve bağlantı ayrıntıları' : 'Record and relationship details')}</h3>
    <div className="cgw-inspect-identity">{identity(inspected)}</div><p>{moduleLabel(inspected.module)} · {recordOwner(inspected)}</p>
    {inspect ? pathView(inspect) : <p className="cgw-muted">{tr ? 'İlişki yolunu incelemek için haritadaki veya listedeki bir kaydı seçin.' : 'Select a record in the map or list to inspect its relationship path.'}</p>}
    {inspected.module === 'BIA' && <><div className="cgw-targets"><div><small>{tr ? 'RTO hedefi' : 'RTO target'}</small><b>{recoveryHoursLabel(inspected.data.rto,tr)}</b></div><div><small>{tr ? 'RPO hedefi' : 'RPO target'}</small><b>{recoveryHoursLabel(inspected.data.rpo,tr)}</b></div></div><small>{tr ? 'BIA hedefleri; tatbikat sonucu değildir.' : 'BIA targets; not exercise results.'}</small></>}
    <h4>{inspect ? (tr ? 'İnceleme konuları' : 'Review topics') : (tr ? 'Görünür kayıtlarda inceleme' : 'Review visible records')} <span>{attention.length}</span></h4>
    {attention.length ? attention.slice(0, 5).map(issue => <article className="cgw-attention" key={issue.id}><b>{issueLabels[issue.kind][language]}</b><small>{issue.row.code || issue.row.id} · {connectedTitle(issue.row)}</small>{issue.due && <small>{issue.due}</small>}{nextAction(issue)}</article>) : <p className="cgw-muted">{complete ? (tr ? 'İncelenen görünür kayıtlarda takip konusu bulunmadı.' : 'No follow-up topic found for the reviewed visible records.') : (tr ? 'Kaynaklar tamamlanmadan eksik olmadığı doğrulanamaz.' : 'No-gap status cannot be confirmed until sources are complete.')}</p>}
    <dl><dt>{tr ? 'Son değişiklik' : 'Last change'}</dt><dd>{inspected.updatedAt ? new Date(inspected.updatedAt).toLocaleString(tr ? 'tr-TR' : 'en-US') : '—'}</dd></dl>
    <button type="button" onClick={() => openRecord(inspected)}>{tr ? 'Kaynak kaydı aç' : 'Open source record'}</button>{inspected.id !== selected?.id && <button type="button" onClick={() => select(inspected)}>{tr ? 'Bu kaydın haritası' : 'Map this record'}</button>}
  </aside>;

  if (view === 'gaps') return <section id="connected-grc-workbench" className="cgw cgw-gaps" aria-label={tr ? 'Eksik tamamlama' : 'Complete gaps'}>{p.tabs}{sourceNotice}<div className="cgw-work-toolbar"><div><h3>{tr ? 'Eksik Tamamlama' : 'Complete Gaps'}</h3><p>{new Set(filteredIssues.map(item => item.row.id)).size} {tr ? 'kayıt' : 'records'} · {filteredIssues.length} {tr ? 'takip konusu' : 'follow-up topics'}</p></div><button type="button" disabled={loading} onClick={exportIssues}>{tr ? 'Görünümü indir · CSV' : 'Export view · CSV'}</button></div>
    <div className="cgw-filters"><input aria-label={tr ? 'Eksik ara' : 'Find issue'} value={issueQuery} onChange={e => { setIssueQuery(e.target.value); setIssueLimit(30); }} placeholder={tr ? 'Kayıt veya kod ara' : 'Find record or code'}/><select aria-label={tr ? 'Kaynak modül' : 'Source module'} value={issueModule} onChange={e => { setIssueModule(e.target.value); setIssueLimit(30); }}><option value="all">{tr ? 'Tüm modüller' : 'All modules'}</option>{p.modules.map(name => <option key={name} value={name}>{moduleLabel(name)}</option>)}</select><select aria-label={tr ? 'Konu türü' : 'Issue type'} value={issueType} onChange={e => { setIssueType(e.target.value); setIssueLimit(30); }}><option value="all">{tr ? 'Tüm konular' : 'All topics'}</option><option value="high">{tr ? 'Yüksek öncelik' : 'High priority'}</option><option value="medium">{tr ? 'Orta öncelik' : 'Medium priority'}</option>{Object.entries(issueLabels).map(([key, names]) => <option key={key} value={key}>{names[language]}</option>)}</select><label className="cgw-check"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)}/>{tr ? 'Bana atananlar' : 'Assigned to me'}</label>{(issueQuery || issueType !== 'all' || issueModule !== 'all' || mine) && <button type="button" onClick={() => { setIssueQuery(''); setIssueType('all'); setIssueModule('all'); setMine(false); }}>{tr ? 'Filtreleri temizle' : 'Clear filters'}</button>}</div>
    <div className="cgw-queue-layout"><div className="cgw-panel"><div className="cgw-table-scroll"><table><caption>{tr ? 'Öncelikli işler' : 'Priority work'}</caption><thead><tr><th>{tr ? 'Kayıt ve konu' : 'Record and topic'}</th><th>{tr ? 'Öncelik' : 'Priority'}</th><th>{tr ? 'Sorumlu' : 'Owner'}</th><th>{tr ? 'Tarih' : 'Date'}</th><th>{tr?'İşlem':'Action'}</th></tr></thead><tbody>{filteredIssues.slice(0, issueLimit).map(issue => <tr key={issue.id} data-selected={issue.id === activeIssue?.id}><th scope="row"><button type="button" className="cgw-identity" onClick={() => { setIssueId(issue.id); setEditor(null); }}>{identity(issue.row)}</button><small>{issueLabels[issue.kind][language]}</small></th><td><span className="cgw-badge">{issue.severity === 'high' ? (tr ? 'Yüksek' : 'High') : (tr ? 'Orta' : 'Medium')}</span></td><td>{recordOwner(issue.row)}</td><td>{issue.due || '—'}</td><td>{nextAction(issue,true)}</td></tr>)}</tbody></table></div>
      {!filteredIssues.length && <p className="cgw-empty">{issueQuery || mine || issueType !== 'all' || issueModule !== 'all' ? (tr ? 'Filtreyle eşleşen takip konusu yok. Diğer kayıtlar için filtreleri temizleyin.' : 'No follow-up topics match. Clear filters to see other records.') : complete ? (tr ? 'Tanımlı kurallarda takip konusu bulunamadı.' : 'No follow-up topics found under the defined rules.') : (tr ? 'Eksik değerlendirmesi henüz doğrulanamadı.' : 'Gap assessment is not yet verified.')}</p>}
      {filteredIssues.length > issueLimit && <button type="button" onClick={() => setIssueLimit(value => value + 30)}>{tr ? 'Daha fazla göster' : 'Show more'}</button>}
      <footer><b>{tr ? 'Eksikler nasıl belirleniyor?' : 'How are gaps identified?'}</b><p>{tr ? 'Kayıt türüne göre gerekli bağlantılar, kanıt tarihleri ve çözümlenemeyen referanslar kontrol edilir. Bunlar uyum veya kontrol etkinliği puanı değildir.' : 'Required relationships, evidence dates and unresolved references are checked per record type. These are not compliance or control-effectiveness scores.'}</p></footer></div>
      {editorView}{(activeIssue ? <aside className="cgw-inspector"><h3>{issueLabels[activeIssue.kind][language]}</h3><div className="cgw-inspect-identity">{identity(activeIssue.row)}</div><p>{recordOwner(activeIssue.row)}</p>{activeIssue.relations.length > 0 && <p>{activeIssue.relations.map(label).join(' · ')}</p>}{activeIssue.detail && <p>{tr ? 'Kaynak referans' : 'Source reference'}: {activeIssue.detail}</p>}{activeIssue.kind === 'ambiguous' && <p>{tr ? 'Hedef otomatik seçilmez. Doğru kaydı ID veya benzersiz koduyla seçin.' : 'No target is selected automatically. Choose the correct record by ID or unique code.'}</p>}{!!activeIssue.candidates?.length && <div className="cgw-candidates"><p>{activeIssue.candidates.length} {tr ? 'olası kayıt' : 'possible records'}</p>{activeIssue.candidates.map(candidate => <p key={candidate.id}>{mapCode(candidate)} · {connectedTitle(candidate)}</p>)}</div>}{nextAction(activeIssue)}<button type="button" onClick={() => openRecord(activeIssue.row)}>{tr ? 'Kaynak kaydı aç' : 'Open source record'}</button></aside> : <aside className="cgw-inspector"><h3>{tr ? 'İncelenecek konu seçin' : 'Select a review topic'}</h3></aside>)}
    </div></section>;

  const focus=p.network==='focus',seenIds=new Set(p.networkRows.map(r=>r.id));
  const diagramLinks=focus?links:links.filter(e=>seenIds.has(e.source.id)&&seenIds.has(e.target.id));
  const diagramRows=focus&&selected?[selected]:p.networkRows;
  const allEdges=links.filter(e=>seenIds.has(e.source.id)||seenIds.has(e.target.id));
  const edgeLimit=25,edgeIndex=Math.min(edgePage,Math.max(0,Math.ceil(allEdges.length/edgeLimit)-1));
  const root=selected||rows.find(r=>linkChoices(r,actor,p.modules).length),firstLink=root&&linkChoices(root,actor,p.modules).length>0;
  return <section id="connected-grc-workbench" className={`cgw cgw-${view}`} aria-label={tr ? 'Bağlantı inceleme masası' : 'Relationship workbench'}>{sourceNotice}
    <div className="cm-command" onKeyDown={event=>{if(event.key==='Escape'){setPicker(false);setToolsOpen(false)}}}>
      {p.tabs}
      <button type="button" className="cm-tools-toggle" aria-controls="cm-map-tools" aria-expanded={toolsOpen} onClick={()=>setToolsOpen(!toolsOpen)}>{tr?'Ara / Filtre':'Map tools'}</button>
      <div id="cm-map-tools" className="cm-tools-panel" data-open={toolsOpen}>
        <div className="cgw-filters">
          <div className="cm-search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setPicker(false)}}>
            <input aria-label={tr?'Kayıt ara':'Find record'} placeholder={tr?'Ad veya kod…':'Name or code…'} value={p.query}
              onFocus={()=>setPicker(view==='explore')} onChange={event=>{p.setQuery(event.target.value);setPicker(true)}}/>
            {view==='explore'&&<>
              <button aria-label={tr?'Kayıt seç':'Select record'} aria-expanded={picker} aria-controls="cm-record-options" onClick={()=>setPicker(v=>!v)}>⌄</button>
              <section className="cgw-records" id="cm-record-options" hidden={!picker} aria-label={tr?'Kayıt seçimi':'Record selection'}>
                <header><b>{tr?'Kayıt seç':'Select record'}</b><span>{p.matchingCount}</span></header>
                {p.visible.map(row=><button className="cgw-identity" type="button" key={row.id} aria-pressed={row.id===selected?.id}
                  onClick={()=>{select(row);p.setNetwork('focus');setDisplay('diagram');setToolsOpen(false);showDetails(row)}}>{identity(row)}</button>)}
                {!p.visible.length&&<p className="cgw-empty">{tr?'Eşleşen kayıt yok.':'No matching records.'}</p>}
                {p.matchingCount>10&&<footer>
                  <button disabled={!p.page} onClick={()=>p.setPage(p.page-1)}>{tr?'Önceki':'Previous'}</button><small>{p.page+1} / {Math.ceil(p.matchingCount/10)}</small>
                  <button disabled={(p.page+1)*10>=p.matchingCount} onClick={()=>p.setPage(p.page+1)}>{tr?'Sonraki':'Next'}</button>
                </footer>}
              </section>
            </>}
          </div>
          <select aria-label={tr?'Modül':'Module'} value={p.module} onChange={event=>p.setModule(event.target.value)}>
            <option value="all">{tr?'Tüm modüller':'All modules'}</option>{p.modules.map(name=><option key={name} value={name}>{moduleLabel(name)}</option>)}
          </select>
          {(p.query||p.module!=='all')&&<button onClick={()=>{p.setQuery('');p.setModule('all')}}>{tr?'Temizle':'Clear'}</button>}
          <button title={tr?'Filtreli görünümü indir':'Export filtered view'} disabled={loading} onClick={view==='impact'?exportImpact:p.exportLinks}>
            {view==='impact'?(complete?(tr?'Görünümü indir · CSV':'Export view · CSV'):(tr?'Kısmi görünümü indir · CSV':'Export partial view · CSV')):'CSV'}
          </button>
        </div>
        {view==='explore'&&<div className="cgw-map-tools">
          <div role="group" aria-label={tr?'Harita modu':'Network mode'}>{(['all','focus'] as const).map(mode=><button key={mode}
            aria-pressed={p.network===mode&&display==='diagram'&&p.metric!=='links'} onClick={()=>{p.setNetwork(mode);setDisplay('diagram');setToolsOpen(false)}}>
            {mode==='all'?(tr?'Genel Ağ (Tümü)':'Full network (All)'):(tr?'Odak Kayıt':'Focus record')}</button>)}</div>
          <button aria-pressed={p.metric==='links'||display==='list'} onClick={()=>{if(p.metric==='links')p.setNetwork(p.network);setDisplay(display==='list'||p.metric==='links'?'diagram':'list');setToolsOpen(false)}}>{tr?'Liste':'List'}</button>
        </div>}
      </div>
    </div>
    {view === 'impact' && selected && <><div className="cgw-panel">{recordHeader}<p className="cgw-scope">{neighborhood.records.length} {tr ? 'ilişkili kayıt · en fazla 3 adım' : 'related records · up to 3 steps'} · {tr ? 'Kayıtlı ilişkilere göre inceleme' : 'Review based on recorded relationships'}</p></div><p className="cgw-note">{tr ? 'İlişkili olmak, etkilenmenin kesinleştiği anlamına gelmez. Süreç sahibinin değerlendirmesi gerekir.' : 'A relationship does not confirm impact. Assessment by the process owner is required.'}</p></>}
    <div className={view === 'impact' ? 'cgw-impact-layout' : 'cgw-layout'}>
      <section className="cgw-panel cgw-canvas-panel">
        {view==='impact'&&<header><h3>{tr ? 'İncelenecek kayıtlar' : 'Records to review'}</h3><select aria-label={tr ? 'Etki kapsamı' : 'Impact scope'} value={impactType} onChange={e => setImpactType(e.target.value)}><option value="all">{tr ? 'Tüm ilişkiler' : 'All relationships'}</option><option value="business">{tr ? 'İş süreçleri ve süreklilik' : 'Business processes and continuity'}</option><option value="assurance">{tr ? 'Risk, kontrol ve kanıt' : 'Risk, control and evidence'}</option></select></header>}
        {view==='explore'&&(p.metric==='links'||display==='list'&&!focus)?<div className="cgw-table-scroll"><table><thead><tr>{[tr?'Kaynak':'Source',tr?'İlişki':'Relationship',tr?'Hedef':'Target'].map(n=><th key={n}>{n}</th>)}</tr></thead><tbody>{allEdges.slice(edgeIndex*edgeLimit,(edgeIndex+1)*edgeLimit).map(e=><tr key={[e.source.id,e.field,e.relation,e.target.id].join('|')}><td><button onClick={()=>showDetails(e.source)}>{identity(e.source)}</button></td><td>{arrowText(e,tr)}</td><td><button onClick={()=>showDetails(e.target)}>{identity(e.target)}</button></td></tr>)}</tbody></table>{!allEdges.length&&<p>{tr?'Bağlantı yok.':'No relationships.'}</p>}{allEdges.length>edgeLimit&&<footer><button disabled={!edgeIndex} onClick={()=>setEdgePage(edgeIndex-1)}>{tr?'Önceki':'Previous'}</button> {edgeIndex+1} / {Math.ceil(allEdges.length/edgeLimit)} <button disabled={(edgeIndex+1)*edgeLimit>=allEdges.length} onClick={()=>setEdgePage(edgeIndex+1)}>{tr?'Sonraki':'Next'}</button></footer>}</div>
        : view === 'impact' || display === 'list' ? <div className="cgw-table-scroll"><table><thead><tr><th>{tr ? 'Kayıt' : 'Record'}</th><th>{tr ? 'Bağlantı' : 'Relationship'}</th><th>{tr ? 'Sorumlu' : 'Owner'}</th><th>{tr ? 'İnceleme' : 'Review'}</th></tr></thead><tbody>{(view === 'impact' ? impacted : neighborhood.records).map(item => <tr key={item.row.id} data-selected={item.row.id === inspectId}><th scope="row"><button type="button" className="cgw-identity" onClick={() => { if(view==='explore')showDetails(item.row);else setInspectId(item.row.id); setEditor(null); }}>{identity(item.row)}</button></th><td>{item.depth === 1 ? (tr ? 'Doğrudan' : 'Direct') : (tr ? 'Dolaylı' : 'Indirect')} · {item.depth} {tr ? 'adım' : 'steps'}</td><td>{recordOwner(item.row)}</td><td>{issues.filter(issue => issue.row.id === item.row.id).length || '—'}</td></tr>)}</tbody></table>{(view === 'impact' ? impacted : neighborhood.records).length === 0 && <p className="cgw-empty">{tr ? 'Bu kapsamda görünür bağlantı yok.' : 'No visible relationships in this scope.'}</p>}</div> : <>
          {(!diagramRows.length||!links.length||focus&&!diagramLinks.length)&&<div className="cm-empty"><b>{!diagramRows.length?(tr?'Eşleşen kayıt yok.':'No matching records.'):(tr?'Bu kapsamda görünür bağlantı yok.':'No visible relationships in this scope.')}</b>{firstLink&&root&&diagramRows.length>0&&<button className="primary" onClick={()=>startEditor(root)}>{links.length?(tr?'Bağlantı ekle':'Add relationship'):(tr?'+ İlk Bağlantıyı Oluştur':'+ Create first relationship')}</button>}{!rows.length&&!loading&&['Admin','Editor'].includes(actor.role)&&<button className="primary" onClick={p.openInventory}>{tr?'+ İlk Bağlantıyı Oluştur':'+ Create first relationship'}</button>}{!rows.length&&<span>{tr?'Önce bir kaynak kayıt oluşturun.':'Create a source record first.'}</span>}</div>}
          {diagramRows.length>0&&<MapCanvas key={focus?'focus:'+selected?.id:'all'} rows={diagramRows} links={diagramLinks} selected={selected} focus={focus} tr={tr} select={showDetails} moduleLabel={moduleLabel}/>}
        </>}

      </section>
      {view==='impact'?inspectView:drawerId&&drawerRow&&<MapDrawer tr={tr} close={()=>setDrawerId('')}><MapInspector refocus={!focus||drawerRow.id!==selected?.id?()=>{select(drawerRow);p.setNetwork('focus');setDisplay('diagram');setDrawerId('')}:undefined} key={drawerRow.id} row={drawerRow} links={links} issues={issues} actor={actor} tr={tr} moduleLabel={moduleLabel} select={showDetails} openRecord={openRecord} refresh={p.refresh} edit={()=>startEditor(drawerRow)}/></MapDrawer>}{editorView}
    </div></section>;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const cell = (value: unknown) => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
