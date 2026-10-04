import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Eclipse Ops Hub',
  description: 'Eclipse Enterprise Operations Portal — BGLC onboarding and live ticket dispatch.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
