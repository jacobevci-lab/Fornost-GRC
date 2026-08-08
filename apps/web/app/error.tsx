'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h2>Bu görünüm yüklenemedi</h2>
      <p>İsteği tekrar deneyin. Sorun sürerse correlation ID ile destek ekibine başvurun.</p>
      <button className="primary" onClick={reset}>
        Tekrar dene
      </button>
    </div>
  );
}
