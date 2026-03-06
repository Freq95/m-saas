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

const { mockGetMongoDbOrThrow, mockGetAuthUser, mockCheckAppointmentConflict, mockUpdateClientStats } = vi.hoisted(
  () => ({
    mockGetMongoDbOrThrow: vi.fn(),
    mockGetAuthUser: vi.fn(),
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
  const userId = 7;
  let appointments: Array<Doc>;
  let services: Array<Doc>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({ userId, tenantId });
    mockCheckAppointmentConflict.mockResolvedValue({ hasConflict: false, conflicts: [], suggestions: [] });
    mockUpdateClientStats.mockResolvedValue(undefined);

    services = [
      { id: 1, user_id: userId, tenant_id: tenantId, name: 'Basic', price: 100 },
      { id: 2, user_id: userId, tenant_id: tenantId, name: 'Premium', price: 250 },
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
      collection(name: 'appointments' | 'services') {
        if (name === 'appointments') {
          return {
            findOne: vi.fn(async (filter: Doc) => appointments.find((doc) => matchesFilter(doc, filter)) ?? null),
            updateOne: vi.fn(async (filter: Doc, update: Doc) => {
              const item = appointments.find((doc) => matchesFilter(doc, filter));
              if (!item) return { matchedCount: 0 };
              if (isObject(update.$set)) Object.assign(item, update.$set);
              return { matchedCount: 1 };
            }),
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
});
