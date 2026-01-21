import type { Metadata } from 'next'
import './globals.css'

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
      <body>{children}</body>
    </html>
  )
}

