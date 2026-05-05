import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

export type TenantStatsSort =
  | 'recent_activity'
  | 'created_desc'
  | 'created_asc'
  | 'name'
  | 'appointments';

export interface TenantStatRow {
  id: string;
  name: string;
  slug: string | null;
  plan: string | null;
  status: string | null;
  createdAt: string | null;
  ownerEmail: string | null;
  ownerId: string | null;
  appointments: number;
  appointments30d: number;
  services: number;
  clients: number;
  calendars: number;
  sharedOut: number;
  sharedIn: number;
  emailIntegrations: number;
  emailProviders: string[];
  seatsUsed: number;
  seatsMax: number;
  lastSeen: string | null;
  events30d: number;
  activeDays30d: number;
}

interface AggregateRow<T = number> {
  _id: ObjectId | null;
  count?: T;
  events?: number;
  lastSeen?: string;
  activeDayCount?: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function toIdString(value: unknown): string {
  if (value instanceof ObjectId) return value.toHexString();
  return String(value ?? '');
}

function buildCountMap(rows: AggregateRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row._id) continue;
    map.set(toIdString(row._id), Number(row.count ?? 0));
  }
  return map;
}

export async function getTenantStats(opts: {
  search?: string;
  sort?: TenantStatsSort;
} = {}): Promise<TenantStatRow[]> {
  const db = await getMongoDbOrThrow();

  const tenantFilter: Record<string, unknown> = {};
  const search = opts.search?.trim();
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    tenantFilter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { slug: { $regex: escaped, $options: 'i' } },
    ];
  }

  const tenants = await db
    .collection('tenants')
    .find(tenantFilter)
    .sort({ created_at: -1 })
    .toArray();

  if (tenants.length === 0) return [];

  const tenantIds: ObjectId[] = tenants
    .map((t: any) => t._id)
    .filter((id: unknown): id is ObjectId => id instanceof ObjectId);
  const ownerIds: ObjectId[] = tenants
    .map((t: any) => t.owner_id)
    .filter((id: unknown): id is ObjectId => id instanceof ObjectId);

  const cutoffISO = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const tenantIdMatch = { tenant_id: { $in: tenantIds } };

  // Owned calendars query is shared between two derived queries below, so kick
  // it off once and let dependent queries chain off the same promise.
  const calendarDocsPromise = db.collection('calendars').find(
    { ...tenantIdMatch, is_active: true, deleted_at: { $exists: false } },
    { projection: { id: 1, tenant_id: 1 } }
  ).toArray();

  // Shares OUT: scoped to calendars actually owned by the tenants we care
  // about, so we don't drag the platform-wide accepted-share set into Node.
  const sharesAcceptedOutPromise = calendarDocsPromise.then(async (docs) => {
    const calIds = docs
      .map((c: any) => c.id)
      .filter((id: unknown): id is number => typeof id === 'number');
    if (calIds.length === 0) return [] as any[];
    return db.collection('calendar_shares').find(
      { status: 'accepted', calendar_id: { $in: calIds } },
      { projection: { calendar_id: 1 } }
    ).toArray();
  });

  const [
    appts,
    appts30,
    services,
    clients,
    calendarDocs,
    sharesAcceptedIn,
    sharesAcceptedOut,
    emailRows,
    teamRows,
    accessRows30,
    accessRowsAll,
    owners,
  ] = await Promise.all([
    db.collection('appointments').aggregate<AggregateRow>([
      { $match: { ...tenantIdMatch, deleted_at: { $exists: false } } },
      { $group: { _id: '$tenant_id', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('appointments').aggregate<AggregateRow>([
      { $match: { ...tenantIdMatch, deleted_at: { $exists: false }, created_at: { $gte: cutoffISO } } },
      { $group: { _id: '$tenant_id', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('services').aggregate<AggregateRow>([
      { $match: { ...tenantIdMatch, deleted_at: { $exists: false } } },
      { $group: { _id: '$tenant_id', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('clients').aggregate<AggregateRow>([
      { $match: { ...tenantIdMatch, deleted_at: { $exists: false } } },
      { $group: { _id: '$tenant_id', count: { $sum: 1 } } },
    ]).toArray(),
    calendarDocsPromise,
    db.collection('calendar_shares').aggregate<AggregateRow>([
      { $match: { shared_with_tenant_id: { $in: tenantIds }, status: 'accepted' } },
      {
        $group: {
          _id: '$shared_with_tenant_id',
          calendarIds: { $addToSet: '$calendar_id' },
        },
      },
      { $project: { count: { $size: '$calendarIds' } } },
    ]).toArray(),
    sharesAcceptedOutPromise,
    db.collection('email_integrations').find(
      { ...tenantIdMatch, is_active: true },
      { projection: { tenant_id: 1, provider: 1 } }
    ).toArray(),
    db.collection('team_members').aggregate<AggregateRow>([
      { $match: { ...tenantIdMatch, status: { $in: ['active', 'pending_invite'] } } },
      { $group: { _id: '$tenant_id', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('data_access_logs').aggregate<AggregateRow>([
      { $match: { tenant_id: { $in: tenantIds }, created_at: { $gte: cutoffISO } } },
      {
        $group: {
          _id: '$tenant_id',
          events: { $sum: 1 },
          lastSeen: { $max: '$created_at' },
          activeDays: { $addToSet: { $substrBytes: ['$created_at', 0, 10] } },
        },
      },
      {
        $project: {
          events: 1,
          lastSeen: 1,
          activeDayCount: { $size: '$activeDays' },
        },
      },
    ]).toArray(),
    db.collection('data_access_logs').aggregate<AggregateRow>([
      { $match: { tenant_id: { $in: tenantIds } } },
      { $group: { _id: '$tenant_id', lastSeen: { $max: '$created_at' } } },
    ]).toArray(),
    ownerIds.length
      ? db.collection('users').find(
          { _id: { $in: ownerIds } },
          { projection: { _id: 1, email: 1 } }
        ).toArray()
      : Promise.resolve([] as any[]),
  ]);

  const apptMap = buildCountMap(appts);
  const appt30Map = buildCountMap(appts30);
  const serviceMap = buildCountMap(services);
  const clientMap = buildCountMap(clients);
  const sharedInMap = buildCountMap(sharesAcceptedIn);
  const teamMap = buildCountMap(teamRows);

  // Calendars per tenant
  const calendarMap = new Map<string, number>();
  const calendarIdToTenant = new Map<number, string>();
  for (const cal of calendarDocs as any[]) {
    if (typeof cal.id !== 'number') continue;
    const tenantKey = toIdString(cal.tenant_id);
    if (!tenantKey) continue;
    calendarIdToTenant.set(cal.id, tenantKey);
    calendarMap.set(tenantKey, (calendarMap.get(tenantKey) ?? 0) + 1);
  }

  // Shared OUT: distinct calendars (owned by tenant) that have ≥1 accepted share
  const sharedOutCalendarsByTenant = new Map<string, Set<number>>();
  for (const share of sharesAcceptedOut as any[]) {
    const calId = share.calendar_id;
    if (typeof calId !== 'number') continue;
    const tenantKey = calendarIdToTenant.get(calId);
    if (!tenantKey) continue;
    let set = sharedOutCalendarsByTenant.get(tenantKey);
    if (!set) {
      set = new Set();
      sharedOutCalendarsByTenant.set(tenantKey, set);
    }
    set.add(calId);
  }

  // Email integrations
  const emailMap = new Map<string, { count: number; providers: Set<string> }>();
  for (const row of emailRows as any[]) {
    const tenantKey = toIdString(row.tenant_id);
    if (!tenantKey) continue;
    let entry = emailMap.get(tenantKey);
    if (!entry) {
      entry = { count: 0, providers: new Set() };
      emailMap.set(tenantKey, entry);
    }
    entry.count += 1;
    if (typeof row.provider === 'string') entry.providers.add(row.provider);
  }

  // Activity (30d): events + active days
  const activity30Map = new Map<string, { events: number; activeDays: number; lastSeen: string | null }>();
  for (const row of accessRows30) {
    const key = toIdString(row._id);
    if (!key) continue;
    activity30Map.set(key, {
      events: Number(row.events ?? 0),
      activeDays: Number(row.activeDayCount ?? 0),
      lastSeen: row.lastSeen ?? null,
    });
  }

  // Activity (all-time): last seen
  const lastSeenAllMap = new Map<string, string>();
  for (const row of accessRowsAll) {
    const key = toIdString(row._id);
    if (!key || !row.lastSeen) continue;
    lastSeenAllMap.set(key, row.lastSeen);
  }

  // Owners
  const ownerMap = new Map<string, { email: string | null }>();
  for (const owner of owners as any[]) {
    ownerMap.set(toIdString(owner._id), { email: owner.email ?? null });
  }

  const rows: TenantStatRow[] = tenants.map((t: any) => {
    const key = toIdString(t._id);
    const activity = activity30Map.get(key);
    const email = emailMap.get(key);
    const ownerKey = toIdString(t.owner_id);
    const lastSeen = activity?.lastSeen ?? lastSeenAllMap.get(key) ?? null;

    return {
      id: key,
      name: typeof t.name === 'string' ? t.name : '(unnamed)',
      slug: typeof t.slug === 'string' ? t.slug : null,
      plan: typeof t.plan === 'string' ? t.plan : null,
      status: typeof t.status === 'string' ? t.status : null,
      createdAt: typeof t.created_at === 'string' ? t.created_at : null,
      ownerEmail: ownerMap.get(ownerKey)?.email ?? null,
      ownerId: ownerKey || null,
      appointments: apptMap.get(key) ?? 0,
      appointments30d: appt30Map.get(key) ?? 0,
      services: serviceMap.get(key) ?? 0,
      clients: clientMap.get(key) ?? 0,
      calendars: calendarMap.get(key) ?? 0,
      sharedOut: sharedOutCalendarsByTenant.get(key)?.size ?? 0,
      sharedIn: sharedInMap.get(key) ?? 0,
      emailIntegrations: email?.count ?? 0,
      emailProviders: email ? Array.from(email.providers).sort() : [],
      seatsUsed: teamMap.get(key) ?? 0,
      seatsMax: Number.isFinite(t.max_seats) ? Number(t.max_seats) : 0,
      lastSeen,
      events30d: activity?.events ?? 0,
      activeDays30d: activity?.activeDays ?? 0,
    };
  });

  const sort: TenantStatsSort = opts.sort ?? 'created_desc';
  rows.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'created_asc':
        return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
      case 'appointments':
        return b.appointments - a.appointments;
      case 'recent_activity':
        return (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '');
      case 'created_desc':
      default:
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    }
  });

  return rows;
}
