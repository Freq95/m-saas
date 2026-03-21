import type { NextAuthConfig } from 'next-auth';

// Edge-compatible auth config — no bcrypt, no mongodb imports.
// Used by middleware (Edge runtime) and extended by auth.ts (Node.js runtime).
export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login?error=true',
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = String(user.id || '');
        token.dbUserId = String((user as any).dbUserId || '');
        token.role = String((user as any).role || 'staff');
        token.tenantId = (user as any).tenantId ? String((user as any).tenantId) : null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId || '');
        session.user.dbUserId = String(token.dbUserId || '');
        session.user.role = String(token.role || 'staff');
        session.user.tenantId = token.tenantId ? String(token.tenantId) : null;
      }
      return session;
    },
  },
};
