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
  mockWithAppointmentWriteLocks,
  mockUpdateClientStats,
  mockGetTenantTimeZone,
} = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockGetNextNumericId: vi.fn(),
  mockGetAuthUser: vi.fn(),
  mockGetCalendarAuth: vi.fn(),
  mockResolveAppointmentDentistAssignment: vi.fn(),
  mockCheckAppointmentConflict: vi.fn(),
  mockCheckWriteRateLimit: vi.fn(),
  mockWithAppointmentWriteLocks: vi.fn(),
  mockUpdateClientStats: vi.fn(),
  mockGetTenantTimeZone: vi.fn(),
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

vi.mock('@/lib/appointment-write-lock', () => {
  class AppointmentWriteBusyError extends Error {}
  return {
    AppointmentWriteBusyError,
    withAppointmentWriteLocks: mockWithAppointmentWriteLocks,
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

vi.mock('@/lib/timezone', () => ({
  getTenantTimeZone: mockGetTenantTimeZone,
}));

import { POST } from '@/app/api/appointments/recurring/route';

describe('POST /api/appointments/recurring shared calendar behavior', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0201');
  const ownerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0202');
  const viewerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0203');
  const serviceFindOne = vi.fn();
  const clientFindOne = vi.fn();
  const insertOne = vi.fn();
  let insertedAppointments: Doc[];

  beforeEach(() => {
    vi.clearAllMocks();
    insertedAppointments = [];
    serviceFindOne.mockReset();
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
    mockWithAppointmentWriteLocks.mockImplementation(async (_context: unknown, callback: () => Promise<unknown>) => callback());
    mockUpdateClientStats.mockResolvedValue(undefined);
    mockGetTenantTimeZone.mockResolvedValue('Europe/Bucharest');
    mockGetNextNumericId.mockImplementation(async (collectionName: string) => (
      collectionName === 'recurrence_groups' ? 9001 : 7001 + insertedAppointments.length
    ));

    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'services') {
          return { findOne: serviceFindOne };
        }
        if (name === 'clients') {
          return { findOne: clientFindOne };
        }
        if (name === 'appointments') {
          return {
            insertOne: async (doc: Doc) => {
              insertedAppointments.push(doc);
              return insertOne(doc);
            },
          };
        }
        throw new Error(`Unexpected collection: ${name}`);
      },
    });
  });

  it('uses selected dentist clients/services while storing under the shared calendar owner', async () => {
    serviceFindOne.mockResolvedValue({
      id: 222,
      name: 'Consultatie initiala',
      duration_minutes: 30,
      price: 150,
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

    expect(serviceFindOne).toHaveBeenCalledWith(expect.objectContaining({
      id: 222,
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
    expect(json.error).toContain('Selecteaza un pacient existent');
    expect(serviceFindOne).not.toHaveBeenCalled();
    expect(insertOne).not.toHaveBeenCalled();
  });
});
