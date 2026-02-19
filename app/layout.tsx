import type { Metadata } from 'next'
import './globals.css'
import '../styles/theme.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import AppChrome from '@/components/AppChrome'
import AuthSessionProvider from '@/components/AuthSessionProvider'

export const metadata: Metadata = {
  title: 'OpsGenie pentru Micro-Servicii',
  description: 'Gestionare mesaje, programări și automatizări pentru micro-servicii',
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

