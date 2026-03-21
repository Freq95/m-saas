import type { Metadata } from 'next'
import './globals.css'
import '../styles/theme.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import AppChrome from '@/components/AppChrome'
import AuthSessionProvider from '@/components/AuthSessionProvider'
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
      <body>
        <AuthSessionProvider>
          <ErrorBoundary>
            <AppChrome>{children}</AppChrome>
          </ErrorBoundary>
        </AuthSessionProvider>
      </body>
    </html>
  )
}

