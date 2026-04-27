import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, any>;

const { mockGetMongoDbOrThrow } = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
}));

vi.mock('@/lib/db/mongo-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/mongo-utils')>('@/lib/db/mongo-utils');
  return {
    ...actual,
    getMongoDbOrThrow: mockGetMongoDbOrThrow,
  };
});

import { getClientProfileData, getClientStatsData } from '@/lib/server/client-profile';

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function matchesValue(value: unknown, expected: unknown): boolean {
  if (value instanceof ObjectId || expected instanceof ObjectId) {
    return String(value) === String(expected);
  }
  return value === expected;
}

function matchesFilter(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or' && Array.isArray(expected)) {
      return expected.some((clause) => matchesFilter(doc, clause));
    }
    if (!isObject(expected) || expected instanceof ObjectId || Array.isArray(expected)) {
      return matchesValue(doc[key], expected);
    }
    if ('$exists' in expected) {
      return (doc[key] !== undefined) === Boolean(expected.$exists);
    }
    return matchesValue(doc[key], expected);
  });
}

function collectionFor(items: Doc[]) {
  return {
    findOne: vi.fn(async (filter: Doc) => items.find((item) => matchesFilter(item, filter)) ?? null),
    find: vi.fn((filter: Doc) => {
      const rows = items.filter((item) => matchesFilter(item, filter));
      return {
        sort: vi.fn(() => ({
          toArray: vi.fn(async () => rows),
        })),
        toArray: vi.fn(async () => rows),
      };
    }),
  };
}

describe('client profile shared-calendar appointments', () => {
  const dentistTenantId = new ObjectId('65f9a0e8f5f89f73d18b0201');
  const ownerTenantId = new ObjectId('65f9a0e8f5f89f73d18b0202');
  const dentistUserId = 13;
  const ownerUserId = 42;
  const clientId = 301;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes shared appointments assigned to the client dentist', async () => {
    const clients = [
      { id: clientId, tenant_id: dentistTenantId, user_id: dentistUserId, name: 'Alice', deleted_at: undefined },
    ];
    const appointments = [
      {
        id: 1,
        client_id: clientId,
        tenant_id: ownerTenantId,
        user_id: ownerUserId,
        service_owner_user_id: dentistUserId,
        service_owner_tenant_id: dentistTenantId,
        service_id: 10,
        start_time: '2026-04-09T09:00:00.000Z',
        end_time: '2026-04-09T09:30:00.000Z',
        status: 'scheduled',
      },
      {
        id: 2,
        client_id: clientId,
        tenant_id: ownerTenantId,
        user_id: ownerUserId,
        service_owner_user_id: 99,
        service_owner_tenant_id: dentistTenantId,
        service_id: 10,
        start_time: '2026-04-10T09:00:00.000Z',
        end_time: '2026-04-10T09:30:00.000Z',
        status: 'scheduled',
      },
    ];
    const services = [
      { id: 10, tenant_id: dentistTenantId, user_id: dentistUserId, name: 'Consultatie', price: 150 },
    ];

    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'clients') return collectionFor(clients);
        if (name === 'appointments') return collectionFor(appointments);
        if (name === 'services') return collectionFor(services);
        if (name === 'conversations') return collectionFor([]);
        if (name === 'messages') return { aggregate: vi.fn(() => ({ toArray: vi.fn(async () => []) })) };
        throw new Error(`Unexpected collection: ${name}`);
      },
    });

    const profile = await getClientProfileData(clientId, dentistTenantId, dentistUserId);

    expect(profile?.appointments).toHaveLength(1);
    expect(profile?.appointments[0]).toMatchObject({
      id: 1,
      service_name: 'Consultatie',
    });
  });

  it('uses shared appointments in client stats without leaking other dentists', async () => {
    const clients = [
      { id: clientId, tenant_id: dentistTenantId, user_id: dentistUserId, name: 'Alice', deleted_at: undefined },
    ];
    const appointments = [
      {
        id: 1,
        client_id: clientId,
        tenant_id: ownerTenantId,
        user_id: ownerUserId,
        service_owner_user_id: dentistUserId,
        service_owner_tenant_id: dentistTenantId,
        service_id: 10,
        start_time: '2026-04-09T09:00:00.000Z',
        end_time: '2026-04-09T09:30:00.000Z',
        status: 'completed',
        price_at_time: 180,
      },
      {
        id: 2,
        client_id: clientId,
        tenant_id: ownerTenantId,
        user_id: ownerUserId,
        service_owner_user_id: 99,
        service_owner_tenant_id: dentistTenantId,
        service_id: 10,
        start_time: '2026-04-10T09:00:00.000Z',
        end_time: '2026-04-10T09:30:00.000Z',
        status: 'completed',
        price_at_time: 999,
      },
    ];
    const services = [
      { id: 10, tenant_id: dentistTenantId, user_id: dentistUserId, name: 'Consultatie', price: 150 },
    ];

    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'clients') return collectionFor(clients);
        if (name === 'appointments') return collectionFor(appointments);
        if (name === 'services') return collectionFor(services);
        throw new Error(`Unexpected collection: ${name}`);
      },
    });

    const stats = await getClientStatsData(clientId, dentistTenantId, dentistUserId);

    expect(stats?.completed_appointments).toBe(1);
    expect(stats?.average_appointment_value).toBe(180);
  });
});
