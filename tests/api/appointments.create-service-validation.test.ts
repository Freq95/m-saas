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
  mockIsSlotAvailable,
  mockCheckWriteRateLimit,
  mockWithAppointmentWriteLocks,
  mockFindOrCreateClient,
  mockLinkAppointmentToClient,
  mockGetTenantTimeZone,
} = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockGetNextNumericId: vi.fn(),
  mockGetAuthUser: vi.fn(),
  mockGetCalendarAuth: vi.fn(),
  mockResolveAppointmentDentistAssignment: vi.fn(),
  mockIsSlotAvailable: vi.fn(),
  mockCheckWriteRateLimit: vi.fn(),
  mockWithAppointmentWriteLocks: vi.fn(),
  mockFindOrCreateClient: vi.fn(),
  mockLinkAppointmentToClient: vi.fn(),
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
  getCalendarById: vi.fn(),
  getOrCreateDefaultCalendar: vi.fn(),
  requireCalendarPermission: vi.fn(),
}));

vi.mock('@/lib/appointment-service', () => ({
  resolveAppointmentDentistAssignment: mockResolveAppointmentDentistAssignment,
  buildAppointmentDentistFields: vi.fn((assignment: any) => ({
    service_owner_user_id: assignment.serviceOwnerUserId,
    service_owner_tenant_id: assignment.serviceOwnerTenantId,
    dentist_db_user_id: assignment.dentistDbUserId,
    dentist_id: assignment.serviceOwnerUserId,
  })),
}));

vi.mock('@/lib/calendar', () => ({
  isSlotAvailable: mockIsSlotAvailable,
}));

vi.mock('@/lib/appointment-write-lock', () => {
  class AppointmentWriteBusyError extends Error {}
  return {
    AppointmentWriteBusyError,
    withAppointmentWriteLocks: mockWithAppointmentWriteLocks,
  };
});

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
  findOrCreateClient: mockFindOrCreateClient,
  linkAppointmentToClient: mockLinkAppointmentToClient,
}));

vi.mock('@/lib/timezone', () => ({
  getTenantTimeZone: mockGetTenantTimeZone,
}));

import { POST } from '@/app/api/appointments/route';

describe('POST /api/appointments service validation', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0011');
  const viewerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0012');
  const ownerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0013');
  const clientId = 301;
  const serviceFindOne = vi.fn();
  const clientFindOne = vi.fn();
  const insertOne = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
        can_edit_all: true,
        can_delete_own: true,
        can_delete_all: true,
      },
      shareId: 77,
    });
    mockCheckWriteRateLimit.mockResolvedValue(null);
    mockIsSlotAvailable.mockResolvedValue(true);
    mockWithAppointmentWriteLocks.mockImplementation(async (_context: unknown, callback: () => Promise<unknown>) => callback());
    mockGetNextNumericId.mockResolvedValue(7001);
    mockResolveAppointmentDentistAssignment.mockResolvedValue({
      serviceOwnerUserId: 13,
      serviceOwnerTenantId: tenantId,
      dentistDbUserId: viewerDbUserId,
      dentistDisplayName: 'Viewer',
      isOwner: false,
      isCurrentUser: true,
    });
    mockFindOrCreateClient.mockResolvedValue({ id: clientId });
    mockLinkAppointmentToClient.mockResolvedValue(undefined);
    mockGetTenantTimeZone.mockResolvedValue('Europe/Bucharest');

    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'services') {
          return {
            findOne: serviceFindOne,
          };
        }

        if (name === 'appointments') {
          return {
            insertOne,
          };
        }

        if (name === 'clients') {
          return {
            findOne: clientFindOne,
          };
        }

        throw new Error(`Unexpected collection: ${name}`);
      },
    });
  });

  it('returns 400 when the selected service does not belong to the current dentist', async () => {
    serviceFindOne.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 11,
        serviceId: 999,
        clientName: 'Alice Example',
        startTime: '2026-04-09T09:00:00.000Z',
        endTime: '2026-04-09T09:30:00.000Z',
      }),
    });

    const res = await POST(req);
    const json = await res.json() as Doc;

    expect(res.status).toBe(400);
    expect(json.error).toBe('Selected service was not found for the chosen dentist');
    expect(serviceFindOne).toHaveBeenCalledWith(expect.objectContaining({
      id: 999,
      user_id: 13,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    }));
    expect(mockIsSlotAvailable).not.toHaveBeenCalled();
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('creates a shared-calendar appointment using the authenticated dentist service scope', async () => {
    serviceFindOne.mockResolvedValue({
      id: 222,
      name: 'Consultatie initiala',
      duration_minutes: 30,
      price: 150,
    });

    const req = new NextRequest('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 11,
        serviceId: 222,
        clientName: 'Alice Example',
        clientEmail: 'alice@example.com',
        startTime: '2026-04-09T09:00:00.000Z',
        endTime: '2026-04-09T09:30:00.000Z',
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
    expect(mockIsSlotAvailable).toHaveBeenCalledWith(
      42,
      tenantId,
      expect.any(Date),
      expect.any(Date),
      expect.objectContaining({ calendarId: 11 })
    );
    expect(insertOne).toHaveBeenCalledTimes(1);
    expect(insertOne.mock.calls[0][0]).toMatchObject({
      id: 7001,
      tenant_id: tenantId,
      user_id: 42,
      calendar_id: 11,
      created_by_user_id: viewerDbUserId,
      dentist_db_user_id: viewerDbUserId,
      service_id: 222,
      service_name: 'Consultatie initiala',
      service_owner_user_id: 13,
      service_owner_tenant_id: tenantId,
      client_id: clientId,
      client_name: 'Alice Example',
      client_email: 'alice@example.com',
      price_at_time: 150,
    });
  });

  it('creates a shared-calendar appointment for another selected dentist', async () => {
    const assignedDentistDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0019');
    mockResolveAppointmentDentistAssignment.mockResolvedValueOnce({
      serviceOwnerUserId: 99,
      serviceOwnerTenantId: tenantId,
      dentistDbUserId: assignedDentistDbUserId,
      dentistDisplayName: 'Dr. Partner',
      isOwner: false,
      isCurrentUser: false,
    });
    serviceFindOne.mockResolvedValue({
      id: 333,
      name: 'Tratament endodontic',
      duration_minutes: 60,
      price: 450,
    });

    const req = new NextRequest('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 11,
        dentistUserId: 99,
        serviceId: 333,
        clientName: 'Bob Example',
        startTime: '2026-04-09T10:00:00.000Z',
        endTime: '2026-04-09T11:00:00.000Z',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(serviceFindOne).toHaveBeenCalledWith(expect.objectContaining({
      id: 333,
      user_id: 99,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    }));
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 42,
      created_by_user_id: viewerDbUserId,
      dentist_db_user_id: assignedDentistDbUserId,
      service_owner_user_id: 99,
      service_id: 333,
    }));
  });

  it('links the explicitly selected client when clientId is provided', async () => {
    serviceFindOne.mockResolvedValue({
      id: 222,
      name: 'Consultatie initiala',
      duration_minutes: 30,
      price: 150,
    });
    clientFindOne.mockResolvedValue({
      id: clientId,
      user_id: 42,
      tenant_id: tenantId,
      name: 'Alice Example',
    });

    const req = new NextRequest('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 11,
        serviceId: 222,
        clientId,
        clientName: 'Alice Example',
        startTime: '2026-04-09T09:00:00.000Z',
        endTime: '2026-04-09T09:30:00.000Z',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(clientFindOne).toHaveBeenCalledWith({
      id: clientId,
      user_id: 42,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    });
    expect(mockFindOrCreateClient).not.toHaveBeenCalled();
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({
      client_id: clientId,
      client_name: 'Alice Example',
    }));
  });

  it('returns 409 when the explicitly selected client no longer exists', async () => {
    serviceFindOne.mockResolvedValue({
      id: 222,
      name: 'Consultatie initiala',
      duration_minutes: 30,
      price: 150,
    });
    clientFindOne.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 11,
        serviceId: 222,
        clientId,
        clientName: 'Alice Example',
        startTime: '2026-04-09T09:00:00.000Z',
        endTime: '2026-04-09T09:30:00.000Z',
      }),
    });

    const res = await POST(req);
    const json = await res.json() as Doc;

    expect(res.status).toBe(409);
    expect(json.error).toContain('Clientul selectat nu mai exista');
    expect(mockFindOrCreateClient).not.toHaveBeenCalled();
    expect(insertOne).not.toHaveBeenCalled();
  });
});
