"use client";
/* eslint-disable @next/next/no-img-element -- authenticated no-store evidence and short-lived blob URLs cannot use a public image optimizer */

import { useEffect, useState } from 'react';
import { withBasePath } from './base-path';
import { EVIDENCE_MAX_BYTES, evidenceInlineType } from './evidence/file-types';
import './evidence-review-workspace.css';

type Preview = { url: string; type: string; text: string; truncated: boolean };
const textTypes = new Set(['text/plain', 'text/csv', 'text/tab-separated-values', 'application/json']);

/** Preview only bytes returned by the existing authenticated evidence endpoint. */
type DocumentProps = {
  fileKey?: string; fileName?: string; title: string; lang: string; demoImage?: string;
};
export function EvidenceDocumentPreview(props: DocumentProps) {
  return <DocumentPreview key={props.fileKey || props.demoImage || props.title} {...props}/>;
}
function DocumentPreview({fileKey,fileName,title,lang,demoImage}: DocumentProps) {
  const tr = lang === 'tr';
  const [preview, setPreview] = useState<Preview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unsupported'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!fileKey) return;
    let live = true, objectUrl = '';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    void (async () => {
      try {
        const response = await fetch(withBasePath(`/api/evidence?key=${encodeURIComponent(fileKey)}`), { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('unavailable');
        const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!evidenceInlineType(type) && !textTypes.has(type)) { if (live) setState('unsupported'); await response.body?.cancel(); return; }
        if (Number(response.headers.get('content-length') || 0) > EVIDENCE_MAX_BYTES) { await response.body?.cancel(); throw new Error('size'); }
        const reader = response.body?.getReader();
        if (!reader) throw new Error('body');
        const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
        try {
          while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > EVIDENCE_MAX_BYTES) { await reader.cancel(); throw new Error('size'); } chunks.push(new Uint8Array(value)); }
        } finally { reader.releaseLock(); }
        if (!live) return;
        const blob = new Blob(chunks, { type });
        if (textTypes.has(type)) {
          const content = await blob.text();
          if (live) setPreview({ url: '', type, text: content.slice(0, 120000), truncated: content.length > 120000 });
        } else {
          objectUrl = URL.createObjectURL(blob);
          if (live) setPreview({ url: objectUrl, type, text: '', truncated: false });
        }
        if (live) setState('ready');
      } catch { if (live) setState('error'); }
      finally { window.clearTimeout(timeout); }
    })();
    return () => { live = false; window.clearTimeout(timeout); controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fileKey, retry]);
  const download = fileKey ? withBasePath(`/api/evidence?key=${encodeURIComponent(fileKey)}`) : '';
  return <section className="ev-document" aria-label={tr ? 'Dosya önizlemesi' : 'Document preview'}>
    <header><div><span className="ev-file-icon" aria-hidden="true">▤</span><div><b>{fileName || title}</b><small>{tr ? 'İnceleme kopyası' : 'Review copy'}</small></div></div>{download && <a href={download}>{tr ? 'İndir' : 'Download'} ↗</a>}</header>
    <div className="ev-document-stage" aria-busy={!!fileKey && state === 'loading'}>
      {!fileKey ? demoImage ? <img src={withBasePath(demoImage)} alt={title}/> : <div className="ev-document-message"><b>{tr ? 'Dosya eklenmemiş' : 'No file attached'}</b><p>{tr ? 'Kayıt bağlamını inceleyebilir, dosya eklendiğinde önizleyebilirsiniz.' : 'Review the record context; a preview becomes available when a file is attached.'}</p></div>
        : state === 'loading' ? <div className="ev-document-message" role="status"><span className="ev-loading-mark"/><p>{tr ? 'Dosya hazırlanıyor…' : 'Preparing the document…'}</p></div>
        : state === 'error' ? <div className="ev-document-message" role="alert"><b>{tr ? 'Önizleme yüklenemedi' : 'Preview unavailable'}</b><p>{tr ? 'Dosya erişimini yeniden deneyin. Bu durum kanıtın kabul edildiği anlamına gelmez.' : 'Retry access to the file. This does not establish evidence acceptance.'}</p><button type="button" onClick={() => { setPreview(null); setState('loading'); setRetry(value => value + 1); }}>{tr ? 'Tekrar dene' : 'Retry preview'}</button></div>
        : state === 'unsupported' ? <div className="ev-document-message"><b>{tr ? 'Dosyayı kendi uygulamasında inceleyin' : 'Review in its native application'}</b><p>{tr ? 'Bu dosya türü için tarayıcı önizlemesi yok. Orijinal dosyayı indirerek inceleyebilirsiniz.' : 'Browser preview is unavailable for this format. Download the original file to review it.'}</p><a href={download}>{tr ? 'Orijinal dosyayı indir' : 'Download original'}</a></div>
        : preview?.type === 'application/pdf' ? <iframe src={preview.url} title={title}/>
        : preview?.url ? <img src={preview.url} alt={title}/>
        : preview ? <div className="ev-text-preview">{preview.truncated && <p role="status">{tr ? 'İlk 120.000 karakter gösteriliyor. Tam içerik için dosyayı indirin.' : 'Showing the first 120,000 characters. Download for the complete content.'}</p>}<pre>{preview.text}</pre></div> : null}
    </div>
  </section>;
}
