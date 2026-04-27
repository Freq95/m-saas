import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetAuthUser,
  mockResolveCalendarOwnerScope,
  mockGetServicesData,
  mockGetCached,
} = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockResolveCalendarOwnerScope: vi.fn(),
  mockGetServicesData: vi.fn(),
  mockGetCached: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => {
  class AuthError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  }
  return { AuthError, getAuthUser: mockGetAuthUser };
});

vi.mock('@/lib/calendar-owner-scope', () => ({
  resolveCalendarOwnerScope: mockResolveCalendarOwnerScope,
}));

vi.mock('@/lib/server/calendar', () => ({
  getServicesData: mockGetServicesData,
}));

vi.mock('@/lib/redis', () => ({
  getCached: mockGetCached,
}));

import { GET } from '@/app/api/services/route';

describe('GET /api/services shared calendar scope', () => {
  const viewerTenantId = new ObjectId('65f9a0e8f5f89f73d18b0201');
  const ownerTenantId = new ObjectId('65f9a0e8f5f89f73d18b0202');
  const viewerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0203');

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAuthUser.mockResolvedValue({
      userId: 13,
      tenantId: viewerTenantId,
      dbUserId: viewerDbUserId,
      email: 'viewer@example.com',
      name: 'Viewer',
      role: 'staff',
    });
    mockResolveCalendarOwnerScope.mockResolvedValue({
      userId: 42,
      tenantId: ownerTenantId,
      calendarAuth: {
        calendarId: 11,
        calendarTenantId: ownerTenantId,
        calendarOwnerId: 42,
        calendarOwnerDbUserId: null,
        isOwner: false,
        permissions: { can_view: true },
        shareId: 7,
      },
    });
    mockGetServicesData.mockResolvedValue([
      { id: 222, name: 'Owner consultation', duration_minutes: 30, price: 150 },
    ]);
    mockGetCached.mockImplementation((_key: string, _ttl: number, callback: () => Promise<unknown>) => callback());
  });

  it('loads the selected calendar owner services without needing dentistUserId', async () => {
    const req = new NextRequest('http://localhost/api/services?calendarId=11');

    const res = await GET(req);
    const json = await res.json() as { services?: Array<{ id: number; name: string }> };

    expect(res.status).toBe(200);
    expect(json.services).toEqual([
      { id: 222, name: 'Owner consultation', duration_minutes: 30, price: 150 },
    ]);
    expect(mockResolveCalendarOwnerScope).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 13, tenantId: viewerTenantId }),
      11
    );
    expect(mockGetServicesData).toHaveBeenCalledWith(42, ownerTenantId);
  });
});
