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
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = request.nextUrl.pathname !== '/login';
      if (isProtected && !isLoggedIn) {
        return Response.redirect(new URL('/login', request.nextUrl.origin));
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = String(user.id || '');
        token.dbUserId = String((user as any).dbUserId || '');
        token.role = String((user as any).role || 'staff');
        token.tenantId = (user as any).tenantId ? String((user as any).tenantId) : null;
        token.sessionVersion = Number((user as any).sessionVersion || 0);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId || '');
        session.user.dbUserId = String(token.dbUserId || '');
        session.user.role = String(token.role || 'staff');
        session.user.tenantId = token.tenantId ? String(token.tenantId) : null;
        session.user.sessionVersion = Number(token.sessionVersion || 0);
      }
      return session;
    },
  },
};
