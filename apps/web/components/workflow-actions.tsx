'use client';
import { useState } from 'react';
import { Check, Plus, Upload } from 'lucide-react';

export function CreateButton({
  label,
  type = 'record',
}: {
  label: string;
  type?: 'record' | 'upload';
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <button
        className="primary"
        onClick={() => {
          setOpen(true);
          setSaved(false);
        }}
      >
        {type === 'upload' ? <Upload size={17} /> : <Plus size={17} />} {label}
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {saved ? (
              <div className="saved">
                <Check />
                <h2>Metadata kaydedildi</h2>
                <p>Foundation sürümünde örnek kayıt yalnızca bu oturumda gösterilir.</p>
                <button className="primary" onClick={() => setOpen(false)}>
                  Kapat
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSaved(true);
                }}
              >
                <span className="eyebrow">Yeni kayıt</span>
                <h2>{label}</h2>
                <label>
                  Başlık
                  <input required maxLength={160} placeholder="Açık ve ölçülebilir bir başlık" />
                </label>
                <label>
                  Sorumlu ekip
                  <input required maxLength={120} placeholder="Örn. IAM Ekibi" />
                </label>
                <label>
                  Açıklama
                  <textarea
                    required
                    maxLength={1000}
                    rows={4}
                    placeholder="Kapsamı ve beklenen sonucu yazın"
                  />
                </label>
                {type === 'upload' && (
                  <label>
                    Dosya metadata
                    <input required type="file" accept=".pdf,.png,.jpg,.jpeg,.csv" />
                  </label>
                )}
                <div className="modal-actions">
                  <button type="button" className="secondary" onClick={() => setOpen(false)}>
                    Vazgeç
                  </button>
                  <button className="primary">Kaydet</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
