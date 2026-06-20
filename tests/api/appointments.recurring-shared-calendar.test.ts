import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;

const {
  mockGetMongoDbOrThrow,
  mockGetNextNumericId,
  mockGetAuthUser,
  mockGetCalendarAuth,
  mockResolveAppointmentDentistAssignment,
  mockCheckAppointmentConflict,
  mockCheckWriteRateLimit,
  mockUpdateClientStats,
} = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockGetNextNumericId: vi.fn(),
  mockGetAuthUser: vi.fn(),
  mockGetCalendarAuth: vi.fn(),
  mockResolveAppointmentDentistAssignment: vi.fn(),
  mockCheckAppointmentConflict: vi.fn(),
  mockCheckWriteRateLimit: vi.fn(),
  mockUpdateClientStats: vi.fn(),
}));

vi.mock('@/lib/db/mongo-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/mongo-utils')>('@/lib/db/mongo-utils');
  return {
    ...actual,
    getMongoDbOrThrow: mockGetMongoDbOrThrow,
    getNextNumericId: mockGetNextNumericId,
  };
});

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

vi.mock('@/lib/calendar-auth', () => ({
  getCalendarAuth: mockGetCalendarAuth,
  getOrCreateDefaultCalendar: vi.fn(),
  requireCalendarPermission: vi.fn(),
}));

vi.mock('@/lib/appointment-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/appointment-service')>('@/lib/appointment-service');
  return {
    ...actual,
    resolveAppointmentDentistAssignment: mockResolveAppointmentDentistAssignment,
  };
});

vi.mock('@/lib/calendar-conflicts', () => ({
  checkAppointmentConflict: mockCheckAppointmentConflict,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkWriteRateLimit: mockCheckWriteRateLimit,
}));

vi.mock('@/lib/cache-keys', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cache-keys')>('@/lib/cache-keys');
  return {
    ...actual,
    invalidateReadCaches: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/client-matching', () => ({
  updateClientStats: mockUpdateClientStats,
  findOrCreateClient: vi.fn(),
}));

import { POST } from '@/app/api/appointments/recurring/route';

describe('POST /api/appointments/recurring shared calendar behavior', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0201');
  const ownerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0202');
  const viewerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0203');
  const serviceFindOne = vi.fn();
  const serviceFind = vi.fn();
  const clientFindOne = vi.fn();
  const insertOne = vi.fn();
  let insertedAppointments: Doc[];

  beforeEach(() => {
    vi.clearAllMocks();
    insertedAppointments = [];
    serviceFindOne.mockReset();
    serviceFind.mockReset();
    clientFindOne.mockReset();
    insertOne.mockReset();

    mockGetAuthUser.mockResolvedValue({
      userId: 13,
      tenantId,
      dbUserId: viewerDbUserId,
      email: 'viewer@example.com',
      name: 'Viewer',
    });
    mockGetCalendarAuth.mockResolvedValue({
      calendarId: 11,
      calendarTenantId: tenantId,
      calendarOwnerId: 42,
      calendarOwnerDbUserId: ownerDbUserId,
      isOwner: false,
      permissions: {
        can_view: true,
        can_create: true,
        can_edit_own: true,
        can_edit_all: false,
        can_delete_own: true,
        can_delete_all: false,
      },
      shareId: 77,
    });
    mockResolveAppointmentDentistAssignment.mockResolvedValue({
      assignedDentistUserId: 13,
      assignedDentistTenantId: tenantId,
      dentistDbUserId: viewerDbUserId,
      dentistDisplayName: 'Viewer',
      isOwner: false,
      isCurrentUser: true,
    });
    mockCheckWriteRateLimit.mockResolvedValue(null);
    mockCheckAppointmentConflict.mockResolvedValue({ hasConflict: false, conflicts: [], suggestions: [] });
    mockUpdateClientStats.mockResolvedValue(undefined);
    mockGetNextNumericId.mockImplementation(async (collectionName: string) => (
      collectionName === 'recurrence_groups' ? 9001 : 7001 + insertedAppointments.length
    ));

    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'services') {
          return { findOne: serviceFindOne, find: serviceFind };
        }
        if (name === 'clients') {
          return { findOne: clientFindOne };
        }
        if (name === 'appointments') {
          const emptyCursor = {
            project: vi.fn(() => emptyCursor),
            sort: vi.fn(() => emptyCursor),
            limit: vi.fn(() => emptyCursor),
            toArray: vi.fn(async () => []),
          };
          return {
            find: vi.fn(() => emptyCursor),
            insertOne: async (doc: Doc) => {
              insertedAppointments.push(doc);
              return insertOne(doc);
            },
          };
        }
        if (name === 'calendars') {
          const calendarCursor = {
            toArray: vi.fn(async () => [{
              id: 11,
              tenant_id: tenantId,
              is_default: false,
              owner_db_user_id: ownerDbUserId,
            }]),
          };
          return {
            find: vi.fn(() => calendarCursor),
            findOne: vi.fn().mockResolvedValue({ id: 11, tenant_id: tenantId, is_default: false }),
          };
        }
        if (name === 'calendar_shares') {
          return { find: vi.fn(() => ({ toArray: vi.fn(async () => []) })) };
        }
        if (name === 'users') {
          return { find: vi.fn(() => ({ toArray: vi.fn(async () => []) })) };
        }
        throw new Error(`Unexpected collection: ${name}`);
      },
    });
  });

  it('uses selected dentist clients/services while storing under the shared calendar owner', async () => {
    serviceFind.mockReturnValue({
      toArray: vi.fn(async () => [{
      id: 222,
      name: 'Consultatie initiala',
      duration_minutes: 30,
      price: 150,
      }]),
    });
    clientFindOne.mockResolvedValue({ id: 301, user_id: 13, tenant_id: tenantId, name: 'Ana Viewer' });

    const req = new NextRequest('http://localhost/api/appointments/recurring', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 11,
        dentistUserId: 13,
        serviceId: 222,
        clientId: 301,
        clientName: 'Ana Viewer',
        startTime: '2026-04-10T09:00:00.000Z',
        endTime: '2026-04-10T09:30:00.000Z',
        recurrence: {
          frequency: 'weekly',
          interval: 1,
          count: 1,
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(serviceFind).toHaveBeenCalledWith(expect.objectContaining({
      id: { $in: [222] },
      user_id: 13,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    }));
    expect(clientFindOne).toHaveBeenCalledWith({
      id: 301,
      user_id: 13,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    });
    expect(insertedAppointments[0]).toMatchObject({
      user_id: 42,
      calendar_id: 11,
      created_by_user_id: viewerDbUserId,
      service_owner_user_id: 13,
      service_owner_tenant_id: tenantId,
      dentist_db_user_id: viewerDbUserId,
      dentist_id: 13,
      service_id: 222,
      client_id: 301,
    });
  });

  it('rejects new patient creation when booking for another dentist', async () => {
    const partnerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0204');
    mockResolveAppointmentDentistAssignment.mockResolvedValueOnce({
      assignedDentistUserId: 99,
      assignedDentistTenantId: tenantId,
      dentistDbUserId: partnerDbUserId,
      dentistDisplayName: 'Dr. Partner',
      isOwner: false,
      isCurrentUser: false,
    });

    const req = new NextRequest('http://localhost/api/appointments/recurring', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 11,
        dentistUserId: 99,
        serviceId: 222,
        clientName: 'Pacient Nou',
        forceNewClient: true,
        startTime: '2026-04-10T09:00:00.000Z',
        endTime: '2026-04-10T09:30:00.000Z',
        recurrence: {
          frequency: 'weekly',
          interval: 1,
          count: 1,
        },
      }),
    });

    const res = await POST(req);
    const json = await res.json() as Doc;

    expect(res.status).toBe(403);
    expect(json.error).toContain('Selectează un pacient existent');
    expect(serviceFindOne).not.toHaveBeenCalled();
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('preflights availability blocks before inserting any recurring instance', async () => {
    serviceFind.mockReturnValue({
      toArray: vi.fn(async () => [{
      id: 222,
      name: 'Consultatie initiala',
      duration_minutes: 30,
      price: 150,
      }]),
    });
    clientFindOne.mockResolvedValue({ id: 301, user_id: 13, tenant_id: tenantId, name: 'Ana Viewer' });
    let conflictCalls = 0;
    mockCheckAppointmentConflict.mockImplementation(async () => {
      conflictCalls += 1;
      if (conflictCalls === 2) {
        return {
          hasConflict: true,
          conflicts: [
            {
              type: 'availability_block',
              block: {
                id: 55,
                type_label: 'Curs',
                reason: 'Curs Bucuresti',
                start_time: '2026-04-17T09:00:00.000Z',
                end_time: '2026-04-17T10:00:00.000Z',
              },
            },
          ],
          suggestions: [],
        };
      }
      return { hasConflict: false, conflicts: [], suggestions: [] };
    });

    const req = new NextRequest('http://localhost/api/appointments/recurring', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 11,
        dentistUserId: 13,
        serviceId: 222,
        clientId: 301,
        clientName: 'Ana Viewer',
        startTime: '2026-04-10T09:00:00.000Z',
        endTime: '2026-04-10T09:30:00.000Z',
        recurrence: {
          frequency: 'weekly',
          interval: 1,
          count: 2,
        },
      }),
    });

    const res = await POST(req);
    const json = await res.json() as Doc;

    expect(res.status).toBe(409);
    expect(json.error).toContain('blocaj de disponibilitate');
    expect(insertOne).not.toHaveBeenCalled();
    expect(insertedAppointments).toHaveLength(0);
  });
});
