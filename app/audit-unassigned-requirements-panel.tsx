'use client';
import { displayRecordCode } from './record-codes';
import './audit-unassigned-requirements.css';

type Row = { id: string; code?: string; module: string; data: Record<string, unknown> };
export default function AuditUnassignedRequirements<T extends Row>({ rows, lang, open, setOpen, canWrite, canDelete, edit, remove }: {
  rows: T[]; lang: 'tr' | 'en'; open: boolean; setOpen: (open: boolean) => void;
  canWrite: boolean; canDelete: boolean; edit: (row: T) => void; remove: (id: string) => void;
}) {
  const tr = lang === 'tr';
  if (!rows.length && !open) return null;
  return <section className="audit-unassigned" aria-label={tr ? 'Portföye bağlanmamış maddeler' : 'Unassigned audit requirements'}>
    <button type="button" className="audit-unassigned-toggle" aria-expanded={open} aria-controls="audit-unassigned-list" onClick={() => setOpen(!open)}>
      {tr ? 'Portföye bağlanmamış maddeler' : 'Unassigned audit requirements'} · {rows.length}
    </button>
    {open && <div id="audit-unassigned-list">
      <p>{tr ? 'Bu kayıtlar mevcut denetimlerden birine bağlı değil ve genel güvence değerlendirmesini engeller. Kaydı düzenleyerek Denetim Adı alanını mevcut bir denetimle eşleştirin veya eksik denetimi portföye ekleyin. Kayıtlar otomatik taşınmaz veya silinmez.' : 'These records are not linked to an existing audit and prevent the overall assurance assessment. Edit the Audit Name to match an existing audit, or add the missing audit to the portfolio. Records are never reassigned or deleted automatically.'}</p>
      {!rows.length ? <p role="status">{tr ? 'Bağlantısız denetim maddesi yok.' : 'No unassigned audit requirements.'}</p> : <div className="audit-unassigned-table" role="region" aria-label={tr ? 'Bağlantısız maddeler tablosu' : 'Unassigned requirements table'} tabIndex={0}>
        <table><thead><tr><th>{tr ? 'Kod / Madde' : 'Code / Requirement'}</th><th>{tr ? 'Kayıtlı denetim adı' : 'Stored audit name'}</th><th>{tr ? 'Sorumlu' : 'Owner'}</th><th>{tr ? 'İşlem' : 'Action'}</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}><td><b>{displayRecordCode(row)}</b><span>{String(row.data.requirementRef || '')} · {String(row.data.requirementTitle || row.data.title || '')}</span></td>
            <td>{String(row.data.auditName || (tr ? 'Belirtilmemiş' : 'Not specified'))}</td><td>{String(row.data.owner || '—')}</td>
            <td>{canWrite && <button type="button" onClick={() => edit(row)}>{tr ? 'Düzenle' : 'Edit'}</button>}{canDelete && <button type="button" onClick={() => remove(row.id)}>{tr ? 'Sil' : 'Delete'}</button>}{!canWrite && !canDelete && '—'}</td></tr>)}</tbody>
        </table>
      </div>}
    </div>}
  </section>;
}
