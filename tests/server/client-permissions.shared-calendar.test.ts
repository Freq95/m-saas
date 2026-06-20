import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockResolveOwnerScope } = vi.hoisted(() => ({
  mockDb: vi.fn(),
  mockResolveOwnerScope: vi.fn(),
}));

vi.mock('@/lib/db/mongo-utils', () => ({ getMongoDbOrThrow: mockDb }));
vi.mock('@/lib/calendar-owner-scope', () => ({ resolveCalendarOwnerScope: mockResolveOwnerScope }));
vi.mock('@/lib/auth-helpers', () => ({
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status = 401) { super(message); this.status = status; }
  },
}));

import { resolveClientScopeForClient } from '@/lib/client-permissions';

describe('resolveClientScopeForClient shared-calendar fallback', () => {
  const viewerTenant = new ObjectId('65f9a0e8f5f89f73d18b1001');
  const ownerTenant = new ObjectId('65f9a0e8f5f89f73d18b1002');
  const dbUserId = new ObjectId('65f9a0e8f5f89f73d18b1003');
  const auth = {
    userId: 13, tenantId: viewerTenant, dbUserId, email: 'viewer@example.com',
    role: 'dentist', assigned_dentist_user_ids: undefined,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    const clients = {
      findOne: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 301, tenant_id: ownerTenant, user_id: 42 }),
    };
    const shares = {
      find: vi.fn(() => ({ toArray: vi.fn(async () => [{ calendar_id: 77 }]) })),
    };
    const calendars = { findOne: vi.fn(async () => ({ id: 77 })) };
    mockDb.mockResolvedValue({
      collection(name: string) {
        if (name === 'clients') return clients;
        if (name === 'calendar_shares') return shares;
        if (name === 'calendars') return calendars;
        throw new Error(name);
      },
    });
    mockResolveOwnerScope.mockResolvedValue({ userId: 42, tenantId: ownerTenant });
  });

  it('recovers the owner scope only through an accepted shared calendar', async () => {
    await expect(resolveClientScopeForClient(auth, 301)).resolves.toEqual({
      userId: 42,
      tenantId: ownerTenant,
      viaSharedCalendar: true,
    });
    expect(mockResolveOwnerScope).toHaveBeenCalledWith(auth, 77);
  });
});
