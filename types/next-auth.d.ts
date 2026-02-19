import 'next-auth';

declare module 'next-auth' {
  interface User {
    role: string;
    tenantId: string | null;
    dbUserId: string;
  }

  interface Session {
    user: {
      id: string;
      dbUserId: string;
      email: string;
      name: string;
      role: string;
      tenantId: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    dbUserId: string;
    role: string;
    tenantId: string | null;
  }
}
