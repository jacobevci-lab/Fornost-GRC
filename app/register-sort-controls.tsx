'use client';
import { viewSortOptions, type ViewSort } from './register-sort';
import './register-sort-controls.css';
export function RegisterSortControls({ module, lang, sort, onChange, disabled = false, compact = false }: { module: string; lang: string; sort?: ViewSort; onChange: (sort: ViewSort | undefined) => void; disabled?: boolean; compact?: boolean }) {
  const tr = lang === 'tr', options = viewSortOptions(module), selected = options.find(option => option.key === sort?.key);
  return <div className="register-sort-controls">
    <label><span className="sort-caption">{tr ? 'Sırala' : 'Sort by'}</span><select aria-label={tr ? 'Sırala' : 'Sort by'} value={selected?.key || ''} disabled={disabled} onChange={event => onChange(event.target.value ? { key: event.target.value, direction: event.target.value === 'inherentRisk' || event.target.value === 'updatedAt' || event.target.value === 'createdAt' ? 'desc' : 'asc' } : undefined)}>
      <option value="">{compact ? (tr ? 'Sırala' : 'Sort by') : (tr ? 'Varsayılan sıralama' : 'Default order')}</option>{options.map(option => <option key={option.key} value={option.key}>{tr ? option.tr : option.en}</option>)}
    </select></label>
    {selected && sort && <><label><span className="sort-caption">{tr ? 'Sıralama yönü' : 'Sort direction'}</span><select title={tr ? 'Eksik değerler sonda.' : 'Missing values last.'} aria-label={tr ? 'Sıralama yönü' : 'Sort direction'} value={sort.direction} disabled={disabled} onChange={event => onChange({ ...sort, direction: event.target.value as ViewSort['direction'] })}><option value="asc">{tr ? 'Artan' : 'Ascending'}</option><option value="desc">{tr ? 'Azalan' : 'Descending'}</option></select></label><small>{tr ? 'Eksik değerler sonda.' : 'Missing values last.'}</small></>}
  </div>;
}
