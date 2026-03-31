import 'next-auth';

declare module 'next-auth' {
  interface User {
    role: string;
    tenantId: string | null;
    dbUserId: string;
    sessionVersion: number;
  }

  interface Session {
    user: {
      id: string;
      dbUserId: string;
      email: string;
      name: string;
      role: string;
      tenantId: string | null;
      sessionVersion: number;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    dbUserId: string;
    role: string;
    tenantId: string | null;
    sessionVersion: number;
  }
}
