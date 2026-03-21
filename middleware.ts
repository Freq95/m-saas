import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export { auth as middleware };

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/calendar/:path*',
    '/clients/:path*',
    '/inbox/:path*',
    '/settings/:path*',
    '/admin/:path*',
  ],
};
