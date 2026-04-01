import type { Metadata } from 'next'
import './globals.css'
import '../styles/theme.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import AppChrome from '@/components/AppChrome'
import AuthSessionProvider from '@/components/AuthSessionProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { validateServerEnv } from '@/lib/env-validation'

validateServerEnv()

export const metadata: Metadata = {
  title: 'densa',
  description: 'Gestionare centralizata pentru mesaje, programari si automatizari',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ro">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#06080d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
      </head>
      <body>
        <ThemeProvider>
          <AuthSessionProvider>
            <ErrorBoundary>
              <AppChrome>{children}</AppChrome>
            </ErrorBoundary>
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
