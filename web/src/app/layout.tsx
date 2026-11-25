import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus Mail | Independent Custom Domain Suite',
  description: 'Send and receive emails from info@devgeeksnexus.com without Gmail or Zoho',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen w-screen overflow-hidden antialiased">{children}</body>
    </html>
  );
}
