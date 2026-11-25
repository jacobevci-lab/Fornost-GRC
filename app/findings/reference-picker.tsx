'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { matchingFindingTargets, type FindingTarget } from './record-references';

type Props = {
  label: string;
  targets: FindingTarget[];
  value: string;
  onChange: (id: string) => void;
  tr: boolean;
  state: 'ready' | 'loading' | 'error';
  retry: () => void;
};

export function FindingReferencePicker({ label, targets, value, onChange, tr, state, retry }: Props) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [index, setIndex] = useState(-1);
  const selected = value ? targets.find(target => target.id === value) : undefined;
  const expanded = open && !value && query.trim().length >= 2 && state === 'ready';
  const matches = expanded ? matchingFindingTargets(targets, query) : [];
  const visible = matches.slice(0, 25);
  const needsSelection = !!query.trim() && !value;
  const missing = !!value && state === 'ready' && !selected;
  const selectMessage = tr ? 'Listeden bir kayıt seçin veya aramayı temizleyin.' : 'Select a record or clear the search.';
  useEffect(() => {
    input.current?.setCustomValidity(needsSelection || missing ? selectMessage : '');
  }, [needsSelection, missing, selectMessage]);
  useEffect(() => {
    if (expanded && index >= 0) document.getElementById(id + '-option-' + index)?.scrollIntoView({block: 'nearest'});
  }, [expanded, index, id]);

  function choose(target: FindingTarget) {
    onChange(target.id);
    setQuery('');
    setOpen(false);
    setIndex(-1);
    input.current?.focus();
  }

  return <div className="capa-reference-field" data-escape-layer={expanded || undefined}>
    <label htmlFor={id}>{label}</label>
    <div className="capa-reference-input">
      <input ref={input} id={id} role="combobox" autoComplete="off" aria-autocomplete="list"
        aria-expanded={expanded} aria-controls={expanded ? id + '-results' : undefined} aria-describedby={id + '-hint'}
        aria-activedescendant={expanded && visible[index] ? id + '-option-' + index : undefined}
        value={selected ? (selected.code === selected.title ? selected.code : selected.code + ' · ' + selected.title) : value || query}
        placeholder={tr ? 'Kod veya başlıkla ara…' : 'Search by code or title…'}
        onFocus={event => { setOpen(true); if (value) event.target.select(); }} onBlur={() => setOpen(false)}
        onChange={event => { onChange(''); setQuery(event.target.value); setIndex(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setQuery(''); setOpen(false); return; }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setIndex(i => Math.max(0, Math.min(visible.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))));
          } else if (event.key === 'Enter' && needsSelection) {
            event.preventDefault();
            if (expanded && visible[index]) choose(visible[index]);
            else { setOpen(true); input.current?.reportValidity(); }
          }
        }}/>
      {(value || query) && <button type="button" data-escape-close={expanded || undefined} aria-label={label + (tr ? ' seçimini temizle' : ' — clear selection')}
        onClick={() => { onChange(''); setQuery(''); setOpen(false); setIndex(-1); input.current?.focus(); }}>×</button>}
    </div>
    {expanded && <ul id={id + '-results'} role="listbox" aria-label={label}>
      {visible.map((row, i) => <li key={row.id} id={id + '-option-' + i} role="option" aria-selected={index === i}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(row)}>
        <strong>{row.title}</strong><span>{row.code}{row.module === 'Uyum' && (tr ? ' · Uyum' : ' · Compliance')}{row.owner && ' · ' + row.owner}</span>
      </li>)}
    </ul>}
    <div id={id + '-hint'} role="status">
      {state === 'error' ? <>{tr ? 'Kayıtlar yüklenemedi.' : 'Records could not be loaded.'} <button type="button" onClick={retry}>{tr ? 'Yeniden dene' : 'Retry'}</button></>
        : state === 'loading' ? (tr ? 'Kayıtlar yükleniyor…' : 'Loading records…')
        : expanded && !matches.length ? (tr ? 'Eşleşen kayıt yok.' : 'No matching records.')
        : expanded && matches.length > visible.length ? (tr ? 'İlk 25 eşleşme gösteriliyor. Aramayı daraltın.' : 'Showing the first 25 matches. Refine your search.')
        : missing || (needsSelection && !expanded) ? selectMessage
        : !value && !expanded ? (tr ? 'Aramak için en az 2 karakter yazın.' : 'Enter at least 2 characters to search.') : null}
    </div>
  </div>;
}
