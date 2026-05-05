import type { Metadata } from 'next'
import './globals.css'
import '../styles/theme.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import AppChrome from '@/components/AppChrome'
import AuthSessionProvider from '@/components/AuthSessionProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { validateServerEnv } from '@/lib/env-validation'
import { auth } from '@/lib/auth'

validateServerEnv()

export const metadata: Metadata = {
  title: 'densa',
  description: 'Gestionare centralizata pentru mesaje, programari si automatizari',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <html lang="ro" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#06080d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        {process.env.NODE_ENV === 'development' && (
          <script dangerouslySetInnerHTML={{ __html: `
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistrations().then(function(regs) {
                regs.forEach(function(reg) { reg.unregister(); });
              });
            }
          `}} />
        )}
      </head>
      <body>
        <ThemeProvider>
          <AuthSessionProvider session={session}>
            <ErrorBoundary>
              <AppChrome>{children}</AppChrome>
            </ErrorBoundary>
          </AuthSessionProvider>
        </ThemeProvider>
        <div className="landscape-lock" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="2" width="14" height="20" rx="2.5" />
            <path d="M12 18h.01" />
          </svg>
          <div className="landscape-lock-title">Roteste dispozitivul</div>
          <div className="landscape-lock-sub">Aplicatia este optimizata pentru modul portret.</div>
        </div>
      </body>
    </html>
  )
}
