import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetAuthUser,
  mockResolveCalendarOwnerScope,
  mockGetClientsData,
  mockGetCached,
  mockLogDataAccess,
} = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockResolveCalendarOwnerScope: vi.fn(),
  mockGetClientsData: vi.fn(),
  mockGetCached: vi.fn(),
  mockLogDataAccess: vi.fn(),
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

vi.mock('@/lib/server/clients', () => ({
  getClientsData: mockGetClientsData,
}));

vi.mock('@/lib/redis', () => ({
  getCached: mockGetCached,
}));

vi.mock('@/lib/audit', () => ({
  logDataAccess: mockLogDataAccess,
}));

import { GET } from '@/app/api/clients/route';

describe('GET /api/clients shared calendar scope', () => {
  const viewerTenantId = new ObjectId('65f9a0e8f5f89f73d18b0101');
  const ownerTenantId = new ObjectId('65f9a0e8f5f89f73d18b0102');
  const viewerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0103');
  const ownerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0104');

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
        calendarOwnerDbUserId: ownerDbUserId,
        isOwner: false,
        permissions: { can_view: true },
        shareId: 7,
      },
    });
    mockGetClientsData.mockResolvedValue({
      clients: [{ id: 301, name: 'Alice Owner Patient' }],
      pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
    });
    mockGetCached.mockImplementation((_key: string, _ttl: number, callback: () => Promise<unknown>) => callback());
    mockLogDataAccess.mockResolvedValue(undefined);
  });

  it('loads patients from the selected calendar owner, not the logged-in user', async () => {
    const req = new NextRequest('http://localhost/api/clients?calendarId=11&search=Alice&page=1&limit=8');

    const res = await GET(req);
    const json = await res.json() as { clients?: Array<{ id: number; name: string }> };

    expect(res.status).toBe(200);
    expect(json.clients).toEqual([{ id: 301, name: 'Alice Owner Patient' }]);
    expect(mockResolveCalendarOwnerScope).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 13, tenantId: viewerTenantId }),
      11
    );
    expect(mockGetClientsData).toHaveBeenCalledWith(expect.objectContaining({
      userId: 42,
      tenantId: ownerTenantId,
      search: 'Alice',
      page: 1,
      limit: 8,
    }));
  });
});
