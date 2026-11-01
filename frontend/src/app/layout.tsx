import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { ThemeProvider, themeInitScript } from '@/components/layout/theme';
import { BRAND } from '@/constants';
import { AuthProvider } from '@/features/auth/auth-provider';
import { fontVariables } from '@/theme/fonts';
import '@/styles/globals.css';


export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.short}` },
  description: `${BRAND.name} — ${BRAND.tagline}. Laboratory information system for authorised staff.`,
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#040816' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster richColors closeButton position="top-right" toastOptions={{ className: 'font-sans' }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
