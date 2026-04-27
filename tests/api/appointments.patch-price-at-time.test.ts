import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEqualValue(left: unknown, right: unknown): boolean {
  if (isObject(left) && isObject(right) && 'toString' in left && 'toString' in right) {
    return String(left) === String(right);
  }
  return left === right;
}

function matchesFilter(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, rawCondition]) => {
    const value = doc[key];
    if (!isObject(rawCondition) || Array.isArray(rawCondition)) {
      return isEqualValue(value, rawCondition);
    }
    if ('$exists' in rawCondition) {
      const exists = typeof value !== 'undefined';
      return exists === Boolean(rawCondition.$exists);
    }
    if ('$ne' in rawCondition) {
      return !isEqualValue(value, rawCondition.$ne);
    }
    return isEqualValue(value, rawCondition);
  });
}

const {
  mockGetMongoDbOrThrow,
  mockGetAuthUser,
  mockGetCalendarAuth,
  mockResolveAppointmentDentistAssignment,
  mockCheckAppointmentConflict,
  mockUpdateClientStats,
} = vi.hoisted(
  () => ({
    mockGetMongoDbOrThrow: vi.fn(),
    mockGetAuthUser: vi.fn(),
    mockGetCalendarAuth: vi.fn(),
    mockResolveAppointmentDentistAssignment: vi.fn(),
    mockCheckAppointmentConflict: vi.fn(),
    mockUpdateClientStats: vi.fn(),
  })
);

vi.mock('@/lib/db/mongo-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/mongo-utils')>('@/lib/db/mongo-utils');
  return {
    ...actual,
    getMongoDbOrThrow: mockGetMongoDbOrThrow,
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

vi.mock('@/lib/calendar-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/calendar-auth')>('@/lib/calendar-auth');
  return {
    ...actual,
    getCalendarAuth: mockGetCalendarAuth,
  };
});

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

vi.mock('@/lib/client-matching', () => ({
  updateClientStats: mockUpdateClientStats,
}));

vi.mock('@/lib/cache-keys', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cache-keys')>('@/lib/cache-keys');
  return {
    ...actual,
    invalidateReadCaches: vi.fn(async () => undefined),
  };
});

import { PATCH } from '@/app/api/appointments/[id]/route';

describe('PATCH /api/appointments/[id] price_at_time behavior', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0001');
  const ownerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0002');
  const userId = 7;
  let appointments: Array<Doc>;
  let services: Array<Doc>;
  let clients: Array<Doc>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({ userId, tenantId, dbUserId: ownerDbUserId, email: 'owner@example.com' });
    mockGetCalendarAuth.mockResolvedValue({
      calendarId: 44,
      calendarTenantId: tenantId,
      calendarOwnerId: userId,
      calendarOwnerDbUserId: ownerDbUserId,
      isOwner: true,
      permissions: {
        can_view: true,
        can_create: true,
        can_edit_own: true,
        can_edit_all: true,
        can_delete_own: true,
        can_delete_all: true,
      },
      shareId: null,
    });
    mockResolveAppointmentDentistAssignment.mockResolvedValue({
      assignedDentistUserId: userId,
      assignedDentistTenantId: tenantId,
      dentistDbUserId: ownerDbUserId,
      dentistDisplayName: 'Owner',
      isOwner: true,
      isCurrentUser: true,
    });
    mockCheckAppointmentConflict.mockResolvedValue({ hasConflict: false, conflicts: [], suggestions: [] });
    mockUpdateClientStats.mockResolvedValue(undefined);

    services = [
      { id: 1, user_id: userId, tenant_id: tenantId, name: 'Basic', price: 100 },
      { id: 2, user_id: userId, tenant_id: tenantId, name: 'Premium', price: 250 },
      { id: 3, user_id: 99, tenant_id: tenantId, name: 'Partner Service', price: 300 },
    ];
    clients = [
      { id: 123, user_id: userId, tenant_id: tenantId, name: 'Existing Client' },
      { id: 456, user_id: userId, tenant_id: tenantId, name: 'Selected Client' },
      { id: 789, user_id: 99, tenant_id: tenantId, name: 'Partner Client' },
    ];

    appointments = [
      {
        id: 10,
        user_id: userId,
        tenant_id: tenantId,
        service_id: 1,
        client_id: 123,
        status: 'scheduled',
        start_time: '2026-03-10T09:00:00.000Z',
        end_time: '2026-03-10T09:30:00.000Z',
        price_at_time: 100,
      },
    ];

    const db = {
      collection(name: 'appointments' | 'services' | 'clients') {
        if (name === 'appointments') {
          return {
            findOne: vi.fn(async (filter: Doc) => appointments.find((doc) => matchesFilter(doc, filter)) ?? null),
            updateOne: vi.fn(async (filter: Doc, update: Doc) => {
              const item = appointments.find((doc) => matchesFilter(doc, filter));
              if (!item) return { matchedCount: 0 };
              if (isObject(update.$set)) Object.assign(item, update.$set);
              return { matchedCount: 1 };
            }),
            findOneAndUpdate: vi.fn(async (filter: Doc, update: Doc) => {
              const item = appointments.find((doc) => matchesFilter(doc, filter));
              if (!item) return null;
              if (isObject(update.$set)) Object.assign(item, update.$set);
              return item;
            }),
          };
        }
        if (name === 'clients') {
          return {
            findOne: vi.fn(async (filter: Doc) => clients.find((doc) => matchesFilter(doc, filter)) ?? null),
          };
        }
        return {
          findOne: vi.fn(async (filter: Doc) => services.find((doc) => matchesFilter(doc, filter)) ?? null),
        };
      },
    };

    mockGetMongoDbOrThrow.mockResolvedValue(db);
  });

  it('updates price_at_time when serviceId changes', async () => {
    const req = new NextRequest('http://localhost/api/appointments/10', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serviceId: 2 }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.appointment.service_id).toBe(2);
    expect(json.appointment.price_at_time).toBe(250);
    expect(appointments[0]?.service_id).toBe(2);
    expect(appointments[0]?.price_at_time).toBe(250);
  });

  it('preserves existing price_at_time when patching unrelated fields', async () => {
    const req = new NextRequest('http://localhost/api/appointments/10', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'Updated notes only' }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.appointment.service_id).toBe(1);
    expect(json.appointment.price_at_time).toBe(100);
    expect(appointments[0]?.price_at_time).toBe(100);
  });

  it('honors an explicitly selected clientId during patch', async () => {
    const req = new NextRequest('http://localhost/api/appointments/10', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: 456,
        clientName: 'Selected Client',
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.appointment.client_id).toBe(456);
    expect(appointments[0]?.client_id).toBe(456);
    expect(appointments[0]?.client_name).toBe('Selected Client');
  });

  it('returns 409 when an explicitly selected clientId is stale', async () => {
    clients = clients.filter((client) => client.id !== 456);

    const req = new NextRequest('http://localhost/api/appointments/10', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: 456,
        clientName: 'Selected Client',
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(409);
    const json = await res.json();

    expect(json.error).toContain('Clientul selectat nu mai exista');
    expect(appointments[0]?.client_id).toBe(123);
  });

  it('updates the assigned dentist and moves the service owner scope', async () => {
    const assignedDentistDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0003');
    appointments[0] = {
      ...appointments[0],
      calendar_id: 44,
      created_by_user_id: ownerDbUserId,
      dentist_db_user_id: ownerDbUserId,
      dentist_id: userId,
      service_owner_user_id: userId,
      service_owner_tenant_id: tenantId,
    };
    mockResolveAppointmentDentistAssignment.mockResolvedValueOnce({
      assignedDentistUserId: 99,
      assignedDentistTenantId: tenantId,
      dentistDbUserId: assignedDentistDbUserId,
      dentistDisplayName: 'Dr. Partner',
      isOwner: false,
      isCurrentUser: false,
    });

    const req = new NextRequest('http://localhost/api/appointments/10', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dentistUserId: 99 }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(200);

    expect(mockResolveAppointmentDentistAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
      44,
      99
    );
    expect(appointments[0]?.dentist_id).toBe(99);
    expect(String(appointments[0]?.dentist_db_user_id)).toBe(String(assignedDentistDbUserId));
    expect(appointments[0]?.service_owner_user_id).toBe(99);
    expect(String(appointments[0]?.service_owner_tenant_id)).toBe(String(tenantId));
  });

  it('validates a changed service against the newly selected dentist', async () => {
    const assignedDentistDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0003');
    appointments[0] = {
      ...appointments[0],
      calendar_id: 44,
      dentist_db_user_id: ownerDbUserId,
      dentist_id: userId,
      service_owner_user_id: userId,
      service_owner_tenant_id: tenantId,
    };
    mockResolveAppointmentDentistAssignment.mockResolvedValueOnce({
      assignedDentistUserId: 99,
      assignedDentistTenantId: tenantId,
      dentistDbUserId: assignedDentistDbUserId,
      dentistDisplayName: 'Dr. Partner',
      isOwner: false,
      isCurrentUser: false,
    });

    const req = new NextRequest('http://localhost/api/appointments/10', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dentistUserId: 99, serviceId: 3 }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(200);

    expect(appointments[0]?.dentist_id).toBe(99);
    expect(appointments[0]?.service_owner_user_id).toBe(99);
    expect(appointments[0]?.service_id).toBe(3);
    expect(appointments[0]?.price_at_time).toBe(300);
  });

  it('validates a changed client against the newly selected dentist', async () => {
    const assignedDentistDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0003');
    appointments[0] = {
      ...appointments[0],
      calendar_id: 44,
      dentist_db_user_id: ownerDbUserId,
      dentist_id: userId,
      service_owner_user_id: userId,
      service_owner_tenant_id: tenantId,
    };
    mockResolveAppointmentDentistAssignment.mockResolvedValueOnce({
      assignedDentistUserId: 99,
      assignedDentistTenantId: tenantId,
      dentistDbUserId: assignedDentistDbUserId,
      dentistDisplayName: 'Dr. Partner',
      isOwner: false,
      isCurrentUser: false,
    });

    const req = new NextRequest('http://localhost/api/appointments/10', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dentistUserId: 99,
        clientId: 789,
        clientName: 'Partner Client',
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '10' }) });
    expect(res.status).toBe(200);

    expect(appointments[0]?.dentist_id).toBe(99);
    expect(appointments[0]?.service_owner_user_id).toBe(99);
    expect(appointments[0]?.client_id).toBe(789);
    expect(appointments[0]?.client_name).toBe('Partner Client');
  });
});
