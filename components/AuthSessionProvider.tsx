'use client';

import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';

export default function AuthSessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session} refetchInterval={5 * 60} refetchOnWindowFocus={true}>
      {children}
    </SessionProvider>
  );
}
