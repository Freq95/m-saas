import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetMongoDbOrThrow,
  mockGetCached,
} = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockGetCached: vi.fn(),
}));

vi.mock('@/lib/db/mongo-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/mongo-utils')>('@/lib/db/mongo-utils');
  return { ...actual, getMongoDbOrThrow: mockGetMongoDbOrThrow };
});

vi.mock('@/lib/redis', () => ({
  getCached: mockGetCached,
}));

vi.mock('@/lib/calendar-auth', () => ({
  getOrCreateDefaultCalendar: vi.fn(),
  normalizeCalendarPermissions: (permissions: any) => permissions,
  OWNER_CALENDAR_PERMISSIONS: {
    can_view: true,
    can_create: true,
    can_edit_own: true,
    can_edit_all: true,
    can_delete_own: true,
    can_delete_all: true,
  },
}));

import { getCalendarListForUser } from '@/lib/server/calendars-list';

describe('getCalendarListForUser receptionist role grant', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0401');
  const dbUserId = new ObjectId('65f9a0e8f5f89f73d18b0402');

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCached.mockImplementation((_key: string, _ttl: number, callback: () => Promise<unknown>) => callback());
  });

  it('returns all active tenant calendars without accepted share rows', async () => {
    const calendarsFind = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: 1,
          id: 1,
          tenant_id: tenantId,
          owner_user_id: 10,
          name: 'Dr A',
          is_default: true,
          is_active: true,
          color_mine: 'blue',
        },
        {
          _id: 2,
          id: 2,
          tenant_id: tenantId,
          owner_user_id: 11,
          name: 'Dr B',
          is_default: true,
          is_active: true,
          color_mine: 'green',
        },
      ]),
    });
    const sharesFind = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'calendars') return { find: calendarsFind };
        if (name === 'calendar_shares') return { find: sharesFind };
        throw new Error(`Unexpected collection: ${name}`);
      },
    });

    const payload = await getCalendarListForUser({
      userId: 99,
      userIdRaw: '99',
      dbUserId,
      tenantId,
      email: 'reception@example.com',
      name: 'Reception',
      role: 'receptionist',
      userStatus: 'active',
      tenantStatus: 'active',
      membershipStatus: 'active',
    });

    expect(payload.ownCalendars).toEqual([]);
    expect(payload.sharedCalendars).toHaveLength(2);
    expect(payload.sharedCalendars.map((calendar) => calendar.owner_user_id)).toEqual([10, 11]);
    expect(payload.sharedCalendars.every((calendar) => calendar.isOwner === false)).toBe(true);
    expect(payload.sharedCalendars.every((calendar) => calendar.permissions.can_create === true)).toBe(true);
    expect(calendarsFind).toHaveBeenCalledWith({
      tenant_id: tenantId,
      is_active: true,
      deleted_at: { $exists: false },
    });
  });
});
