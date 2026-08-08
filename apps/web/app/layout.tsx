import type { Metadata } from 'next';
import { Shell } from '../components/shell';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'CISO-GRC Command Center', template: '%s · CISO-GRC' },
  description: 'Kurumsal bilgi güvenliği, risk ve uyum operasyon merkezi.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
