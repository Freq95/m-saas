import { ObjectId } from 'mongodb';
import { startOfMonth, subMonths, addDays } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardData } from '@/lib/server/dashboard';

/**
 * Covers the dashboard's "Venituri · lună" computation, which the existing
 * pricing-source test stubs to empty. Two behaviours are asserted:
 *   1. month revenue uses price_at_time first, then the service.price fallback
 *      (so months without snapshotted prices aren't undercounted);
 *   2. the month-over-month delta is null when there's no meaningful prior
 *      baseline (< 100), and a clamped percentage when there is.
 */

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
    sort() {
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

function inIsoRange(value: unknown, range: { $gte?: string; $lte?: string } | undefined): boolean {
  if (!range) return true;
  if (typeof value !== 'string') return false;
  if (range.$gte && value < range.$gte) return false;
  if (range.$lte && value > range.$lte) return false;
  return true;
}

function matchAppointments(appointments: Array<Doc>, query: Doc): Array<Doc> {
  return appointments.filter((apt) => {
    if (query.deleted_at && 'deleted_at' in apt) return false;
    if (!inIsoRange(apt.start_time, query.start_time as any)) return false;
    const statusIn = (query.status as { $in?: string[] } | undefined)?.$in;
    if (statusIn && !statusIn.includes(apt.status as string)) return false;
    return true;
  });
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

const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0007');
const userId = 42;

function isoAt(base: Date, hour = 10): string {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour, 0, 0)).toISOString();
}

function buildDb(appointments: Array<Doc>, services: Array<Doc>) {
  return {
    collection(name: string) {
      if (name === 'appointments') {
        return {
          find: (query: Doc) => createCursor(matchAppointments(appointments, query)),
          countDocuments: async (query: Doc) => matchAppointments(appointments, query).length,
          aggregate: () => ({ toArray: async () => [] as Doc[] }),
        };
      }
      if (name === 'services') {
        return {
          find: (query: Doc) => {
            const idIn = (query.id as { $in?: number[] } | undefined)?.$in;
            const rows = services.filter((s) => !idIn || idIn.includes(Number(s.id)));
            return createCursor(rows);
          },
        };
      }
      if (name === 'clients') {
        return {
          countDocuments: async () => 3,
          find: () => createCursor([]),
          aggregate: () => ({ toArray: async () => [] as Doc[] }),
        };
      }
      if (name === 'conversations') {
        return { find: () => createCursor([]) };
      }
      if (name === 'messages') {
        return { aggregate: () => ({ toArray: async () => [] as Doc[] }) };
      }
      if (name === 'users') {
        return { find: () => createCursor([]) };
      }
      throw new Error(`Unsupported collection in test: ${name}`);
    },
  };
}

describe('dashboard month revenue & delta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sums month revenue with the service.price fallback when price_at_time is missing', async () => {
    const now = new Date();
    const thisMonth = isoAt(addDays(startOfMonth(now), 1));
    const services: Array<Doc> = [
      { id: 1, tenant_id: tenantId, user_id: userId, name: 'Consult', price: 300 },
    ];
    const appointments: Array<Doc> = [
      // snapshotted price wins
      { id: 1, tenant_id: tenantId, user_id: userId, service_id: 1, status: 'completed', start_time: thisMonth, end_time: thisMonth, price_at_time: 200 },
      // no price_at_time → falls back to service.price (300)
      { id: 2, tenant_id: tenantId, user_id: userId, service_id: 1, status: 'scheduled', start_time: thisMonth, end_time: thisMonth },
    ];
    mockGetMongoDbOrThrow.mockResolvedValue(buildDb(appointments, services));

    const dashboard = await getDashboardData(userId, tenantId, 7);

    expect(dashboard.monthRevenue).toBe(500);
    // No prior-month appointments → baseline 0 (< 100) → delta omitted.
    expect(dashboard.monthRevenueDeltaPct).toBeNull();
  });

  it('returns a clamped percentage when a real prior-month baseline exists', async () => {
    const now = new Date();
    const thisMonth = isoAt(addDays(startOfMonth(now), 1));
    const lastMonth = isoAt(addDays(startOfMonth(subMonths(now, 1)), 1));
    const appointments: Array<Doc> = [
      { id: 1, tenant_id: tenantId, user_id: userId, service_id: 1, status: 'completed', start_time: thisMonth, end_time: thisMonth, price_at_time: 500 },
      { id: 2, tenant_id: tenantId, user_id: userId, service_id: 1, status: 'completed', start_time: lastMonth, end_time: lastMonth, price_at_time: 600 },
      { id: 3, tenant_id: tenantId, user_id: userId, service_id: 1, status: 'completed', start_time: lastMonth, end_time: lastMonth, price_at_time: 400 },
    ];
    mockGetMongoDbOrThrow.mockResolvedValue(buildDb(appointments, []));

    const dashboard = await getDashboardData(userId, tenantId, 7);

    expect(dashboard.monthRevenue).toBe(500);
    // last month = 1000, this month = 500 → round((500-1000)/1000*100) = -50
    expect(dashboard.monthRevenueDeltaPct).toBe(-50);
  });
});
