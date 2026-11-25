"use client";

import { useId, type ReactNode } from 'react';
import './research-workspaces.css';

export type WorkspaceTab = { key: string; label: string; count?: number; content: ReactNode };

/** Keep panels mounted so a change of view never discards an in-progress form. */
export function WorkspaceTabs({ label, items, active, onChange }: {
  label: string; items: WorkspaceTab[]; active: string; onChange: (key: string) => void;
}) {
  const id = useId();
  const current = items.some(item => item.key === active) ? active : items[0]?.key;
  return <div className="fw-workspace-tabs">
    <div role="tablist" aria-label={label} className="fw-tab-list">
      {items.map((item, index) => <button key={item.key} type="button" role="tab"
        id={`${id}-tab-${item.key}`} aria-controls={`${id}-panel-${item.key}`}
        aria-selected={current === item.key} tabIndex={current === item.key ? 0 : -1}
        onClick={() => onChange(item.key)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % items.length
            : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); onChange(items[next].key);
          document.getElementById(`${id}-tab-${items[next].key}`)?.focus();
        }}>
        {item.label}{item.count !== undefined && <span>{item.count}</span>}
      </button>)}
    </div>
    {items.map(item => <div key={item.key} id={`${id}-panel-${item.key}`} role="tabpanel"
      aria-labelledby={`${id}-tab-${item.key}`} hidden={current !== item.key}
      className="fw-tab-panel" tabIndex={0}>{item.content}</div>)}
  </div>;
}
