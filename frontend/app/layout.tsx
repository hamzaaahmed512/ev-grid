import type { Metadata, Viewport } from 'next';
import './globals.css';
import './responsive.css';
import { AuthProvider } from '../lib/auth-context';

export const metadata: Metadata = {
  title: 'EV Grid — Power Your Journey',
  description: 'Discover, reserve, and share EV charging stations across Pakistan.',
  icons: { icon: '/ev-grid-logo.webp' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/manrope-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
