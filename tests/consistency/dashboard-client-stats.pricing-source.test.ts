import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardData } from '@/lib/server/dashboard';
import { getClientStatsData } from '@/lib/server/client-profile';

type Doc = Record<string, unknown>;

type CursorApi = {
  project: (projection: Record<string, 1>) => CursorApi;
  sort: (spec: Record<string, 1 | -1>) => CursorApi;
  limit: (count: number) => CursorApi;
  toArray: () => Promise<Array<Doc>>;
};

function createCursor(docs: Array<Doc>): CursorApi {
  let rows = [...docs];
  return {
    project(projection: Record<string, 1>) {
      const keys = Object.keys(projection).filter((key) => projection[key] === 1);
      rows = rows.map((doc) =>
        keys.reduce<Record<string, unknown>>((acc, key) => {
          if (key in doc) acc[key] = doc[key];
          return acc;
        }, {})
      );
      return this;
    },
    sort(spec: Record<string, 1 | -1>) {
      const [key, direction] = Object.entries(spec)[0] ?? [];
      if (!key || !direction) return this;
      rows.sort((a, b) => {
        const left = a[key] as string | number | undefined;
        const right = b[key] as string | number | undefined;
        if (left === right) return 0;
        if (typeof left === 'number' && typeof right === 'number') {
          return direction === 1 ? left - right : right - left;
        }
        return direction === 1
          ? String(left ?? '').localeCompare(String(right ?? ''))
          : String(right ?? '').localeCompare(String(left ?? ''));
      });
      return this;
    },
    limit(count: number) {
      rows = rows.slice(0, count);
      return this;
    },
    async toArray() {
      return rows;
    },
  };
}

function inIsoRange(value: unknown, lower: string, upper: string): boolean {
  if (typeof value !== 'string') return false;
  return value >= lower && value <= upper;
}

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

describe('dashboard/client stats pricing source consistency', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0003');
  const userId = 77;

  beforeEach(() => {
    vi.clearAllMocks();
    const now = new Date();
    const todayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 10, 0, 0)).toISOString();
    const todayEndIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 0, 0)).toISOString();

    const client = {
      id: 1001,
      tenant_id: tenantId,
      user_id: userId,
      name: 'Client Test',
      deleted_at: undefined,
      created_at: todayIso,
    };

    const appointments: Array<Doc> = [
      {
        id: 5001,
        client_id: 1001,
        tenant_id: tenantId,
        user_id: userId,
        service_id: 1,
        status: 'completed',
        start_time: todayIso,
        end_time: todayEndIso,
        price_at_time: 120,
      },
      {
        id: 5002,
        client_id: 1001,
        tenant_id: tenantId,
        user_id: userId,
        service_id: 2,
        status: 'completed',
        start_time: todayIso,
        end_time: todayEndIso,
        // Missing price_at_time should fall back to service current price.
      },
    ];

    const services: Array<Doc> = [
      { id: 1, tenant_id: tenantId, user_id: userId, name: 'Consult', price: 999 },
      { id: 2, tenant_id: tenantId, user_id: userId, name: 'Deep Clean', price: 300 },
    ];

    const db = {
      collection(name: string) {
        if (name === 'appointments') {
          return {
            find(query: Doc) {
              const rows = appointments.filter((apt) => {
                if (apt.user_id !== query.user_id) return false;
                if (String(apt.tenant_id) !== String(query.tenant_id)) return false;
                if (query.client_id !== undefined && apt.client_id !== query.client_id) return false;
                if (query.deleted_at && 'deleted_at' in apt) return false;
                const range = query.start_time as { $gte: string; $lte: string } | undefined;
                if (range && !inIsoRange(apt.start_time, range.$gte, range.$lte)) return false;
                return true;
              });
              return createCursor(rows);
            },
          };
        }

        if (name === 'services') {
          return {
            find(query: Doc) {
              const idIn = (query.id as { $in?: number[] } | undefined)?.$in;
              const rows = services.filter((service) => {
                if (query.user_id !== undefined && service.user_id !== query.user_id) return false;
                if (query.tenant_id !== undefined && String(service.tenant_id) !== String(query.tenant_id)) return false;
                if (idIn && !idIn.includes(Number(service.id))) return false;
                return true;
              });
              return createCursor(rows);
            },
          };
        }

        if (name === 'clients') {
          return {
            findOne: vi.fn(async (query: Doc) => {
              if (query.id !== client.id) return null;
              if (query.user_id !== undefined && query.user_id !== client.user_id) return null;
              if (query.tenant_id !== undefined && String(query.tenant_id) !== String(client.tenant_id)) return null;
              return client;
            }),
            countDocuments: vi.fn(async () => 1),
            find: vi.fn(() => createCursor([])),
            aggregate: vi.fn(() => ({ toArray: async () => [] })),
          };
        }

        if (name === 'conversations') {
          return {
            find: vi.fn(() => createCursor([])),
          };
        }

        if (name === 'messages') {
          return {
            aggregate: vi.fn(() => ({ toArray: async () => [] })),
          };
        }

        throw new Error(`Unsupported collection in test: ${name}`);
      },
    };

    mockGetMongoDbOrThrow.mockResolvedValue(db);
  });

  it('uses price_at_time first and service price fallback in both dashboard and client stats', async () => {
    const dashboard = await getDashboardData(userId, tenantId, 7);
    const stats = await getClientStatsData(1001, tenantId, userId);
    const resolvedStats = stats!;

    expect(dashboard.estimatedRevenue).toBe(420);
    expect(stats).not.toBeNull();
    expect(resolvedStats.completed_appointments).toBe(2);
    expect(resolvedStats.average_appointment_value).toBe(210);
    expect(resolvedStats.average_appointment_value * resolvedStats.completed_appointments).toBe(dashboard.estimatedRevenue);
  });
});
