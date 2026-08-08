import Link from 'next/link';
import {
  Activity,
  Archive,
  Boxes,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

const nav = [
  ['/', 'Genel Bakış', Gauge],
  ['/assets', 'Varlıklar', Boxes],
  ['/risks', 'Riskler', TriangleAlert],
  ['/controls', 'Kontroller', ShieldCheck],
  ['/evidence', 'Kanıtlar', FileCheck2],
  ['/assessments', 'Değerlendirmeler', Activity],
  ['/findings', 'Bulgular', Archive],
  ['/audits', 'Denetimler', ClipboardCheck],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">CG</span>
          <span>
            <strong>CISO·GRC</strong>
            <small>Command Center</small>
          </span>
        </Link>
        <nav aria-label="Ana navigasyon">
          {nav.map(([href, label, Icon]) => (
            <Link key={href} href={href}>
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="tenant">
          <span className="status-dot" />
          <div>
            <small>Çalışma alanı</small>
            <strong>Örnek Teknoloji A.Ş.</strong>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="search">
            <Search size={17} />
            <span>Risk, kontrol veya varlık ara…</span>
            <kbd>⌘ K</kbd>
          </div>
          <div className="user">
            <span>YE</span>
            <div>
              <strong>Yakup Evci</strong>
              <small>CISO</small>
            </div>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'danger' | 'warning' | 'success' | 'info' | 'neutral';
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <ShieldCheck />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
