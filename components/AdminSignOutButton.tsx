'use client';

import { signOut } from 'next-auth/react';

export default function AdminSignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/login' })}
      style={{
        marginTop: 16,
        width: '100%',
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid #334155',
        background: '#0f172a',
        color: '#e2e8f0',
      }}
    >
      Sign out
    </button>
  );
}
