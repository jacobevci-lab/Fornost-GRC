'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssuranceRow } from './control-assurance';
import { withBasePath } from './base-path';
import { applyEvidenceAssuranceSnapshot } from './evidence/assurance-snapshot';
import { parseExecutiveAssuranceSnapshot, type ExecutiveAssuranceSnapshot } from './executive-assurance-snapshot';

export function useExecutiveAssurance(rows: AssuranceRow[]) {
  const [result, setResult] = useState<{ scope: AssuranceRow[]; snapshot: ExecutiveAssuranceSnapshot | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const serial = useRef(0);
  const refresh = useCallback(() => { setResult(null); setLoading(true); setRevision(value => value + 1); }, []);
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    const load = async () => {
      // Focus and visibility can arrive together. The pending read already
      // refreshes this scope; do not cancel it for a duplicate refresh signal.
      if (controller) return;
      const request = ++serial.current;
      const current = new AbortController();
      controller = current;
      const timeout = window.setTimeout(() => current.abort(), 15000);
      setResult(null); setLoading(true);
      try {
        const response = await fetch(withBasePath('/api/executive-assurance'), { cache: 'no-store', signal: current.signal });
        if (!response.ok) throw new Error('Unavailable');
        const snapshot = parseExecutiveAssuranceSnapshot(await response.json());
        if (active && request === serial.current) setResult({ scope: rows, snapshot });
      } catch { if (active && request === serial.current) setResult({ scope: rows, snapshot: null }); }
      finally { window.clearTimeout(timeout); if (controller === current) controller = null; if (active && request === serial.current) setLoading(false); }
    };
    void load();
    const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(onFocus, 60000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { active = false; controller?.abort(); window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [rows, revision]);
  const snapshot = result?.scope === rows ? result.snapshot : null;
  const applied = useMemo(() => applyEvidenceAssuranceSnapshot(rows, snapshot), [rows, snapshot]);
  return { ...applied, auditPortfolio: snapshot?.auditPortfolio, generatedAt: snapshot?.generatedAt, loading: loading || (result !== null && result.scope !== rows), refresh };
}
