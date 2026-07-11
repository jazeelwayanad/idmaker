import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'IDMaker Pro',
  description: 'Bulk ID Card Production System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-dark-900 text-foreground">
        {children}
      </body>
    </html>
  );
}
