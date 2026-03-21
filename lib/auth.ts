import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { CredentialsSignin } from 'next-auth';
import bcrypt from 'bcryptjs';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { authConfig } from '@/lib/auth.config';

class DatabaseConnectionSigninError extends CredentialsSignin {
  code = 'database_connection_failed';
}

function isMongoInfrastructureError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name.startsWith('Mongo') ||
    error.message.includes('MongoDB is not available') ||
    error.message.includes('SSL routines') ||
    error.message.includes('tlsv1')
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.toLowerCase().trim() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';

        if (!email || !password) return null;
        try {
          const db = await getMongoDbOrThrow();
          const user = await db.collection('users').findOne({ email });

          if (!user || !user.password_hash || user.status !== 'active') return null;

          if (user.role !== 'super_admin') {
            if (!user.tenant_id) return null;
            const [tenant, membership] = await Promise.all([
              db.collection('tenants').findOne({ _id: user.tenant_id }),
              db.collection('team_members').findOne({ user_id: user._id, tenant_id: user.tenant_id }),
            ]);
            if (!tenant || tenant.status !== 'active') return null;
            if (!membership || membership.status !== 'active') return null;
          }

          const isValid = await bcrypt.compare(password, String(user.password_hash));
          if (!isValid) return null;

          const userId = user.id ? String(user.id) : String(user._id);

          return {
            id: userId,
            dbUserId: String(user._id),
            email: user.email,
            name: user.name || '',
            role: String(user.role || 'staff'),
            tenantId: user.tenant_id ? String(user.tenant_id) : null,
          };
        } catch (error) {
          if (isMongoInfrastructureError(error)) {
            throw new DatabaseConnectionSigninError();
          }
          throw error;
        }
      },
    }),
  ],
});
