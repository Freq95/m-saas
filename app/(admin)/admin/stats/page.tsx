import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';
import {
  getTenantStats,
  type TenantStatRow,
  type TenantStatsSort,
} from '@/lib/server/admin-stats';

type StatsPageProps = {
  searchParams?: Promise<{
    search?: string;
    sort?: string;
  }>;
};

const SORT_OPTIONS: { value: TenantStatsSort; label: string }[] = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'recent_activity', label: 'Most recently active' },
  { value: 'appointments', label: 'Most appointments' },
  { value: 'name', label: 'Name (A–Z)' },
];

function isSortKey(value: unknown): value is TenantStatsSort {
  return typeof value === 'string' && SORT_OPTIONS.some((opt) => opt.value === value);
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.floor(days / 365);
  return `${years} y ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

const ROW_LABEL: React.CSSProperties = { color: '#94a3b8', fontSize: 12 };
const ROW_VALUE: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };
const BADGE_BASE: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  border: '1px solid #334155',
  borderRadius: 999,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

function statusBadgeStyle(status: string | null): React.CSSProperties {
  if (status === 'suspended' || status === 'deleted') {
    return { ...BADGE_BASE, borderColor: '#dc2626', color: '#fca5a5' };
  }
  return BADGE_BASE;
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={ROW_LABEL}>{label}</span>
      <span style={ROW_VALUE}>{value}</span>
    </div>
  );
}

function TenantCard({ tenant }: { tenant: TenantStatRow }) {
  const emailLabel =
    tenant.emailIntegrations === 0
      ? 'none'
      : `${tenant.emailIntegrations} (${tenant.emailProviders.join(', ') || 'unknown'})`;
  const sharedLabel = `${tenant.sharedOut} out / ${tenant.sharedIn} in`;
  const seatsLabel = tenant.seatsMax > 0
    ? `${tenant.seatsUsed} / ${tenant.seatsMax}`
    : `${tenant.seatsUsed}`;

  return (
    <div
      style={{
        border: '1px solid #334155',
        borderRadius: 8,
        padding: 14,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <Link
            href={`/admin/tenants/${tenant.id}`}
            style={{ fontSize: 16, fontWeight: 600 }}
          >
            {tenant.name}
          </Link>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {tenant.ownerEmail || 'no owner'} · created {formatDate(tenant.createdAt)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {tenant.plan && <span style={BADGE_BASE}>{tenant.plan}</span>}
          {tenant.status && <span style={statusBadgeStyle(tenant.status)}>{tenant.status}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        <StatRow
          label="Appointments"
          value={`${tenant.appointments} (${tenant.appointments30d} in 30d)`}
        />
        <StatRow label="Clients" value={tenant.clients} />
        <StatRow label="Services" value={tenant.services} />
        <StatRow label="Calendars" value={tenant.calendars} />
        <StatRow label="Shared calendars" value={sharedLabel} />
        <StatRow label="Email integrations" value={emailLabel} />
        <StatRow label="Seats" value={seatsLabel} />
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'grid', gap: 4 }}>
        <StatRow label="Last seen" value={formatRelative(tenant.lastSeen)} />
        <StatRow label="Active days (30d)" value={tenant.activeDays30d} />
        <StatRow label="Events (30d)" value={tenant.events30d} />
      </div>
    </div>
  );
}

export default async function AdminStatsPage({ searchParams }: StatsPageProps) {
  const superAdmin = await getSuperAdmin().catch(() => null);
  if (!superAdmin) {
    redirect('/login');
  }
  const { userId: actorUserId, email: actorEmail } = superAdmin;

  const resolved = searchParams ? await searchParams : undefined;
  const search = resolved?.search?.trim() || '';
  const rawSort = resolved?.sort;
  const sort: TenantStatsSort = isSortKey(rawSort) ? rawSort : 'created_desc';

  const rows = await getTenantStats({ search, sort });

  await logDataAccess({
    actorUserId,
    actorEmail,
    actorRole: 'super_admin',
    targetType: 'admin.stats',
    route: '/admin/stats',
    metadata: {
      search: search || null,
      sort,
      resultCount: rows.length,
    },
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Tenant Stats</h1>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            Per-tenant snapshot. Activity is derived from request logs (no session tracking exists).
          </p>
        </div>
        <form method="GET" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            name="search"
            placeholder="Search by name or slug"
            defaultValue={search}
            style={{ padding: '6px 10px', minWidth: 220 }}
          />
          <select name="sort" defaultValue={sort} style={{ padding: '6px 10px' }}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button type="submit" style={{ padding: '6px 12px' }}>
            Apply
          </button>
          {(search || sort !== 'created_desc') && (
            <Link href="/admin/stats" style={{ fontSize: 12 }}>
              reset
            </Link>
          )}
        </form>
      </div>

      {rows.length === 0 ? (
        <div style={{ border: '1px dashed #334155', padding: 24, textAlign: 'center', color: '#94a3b8' }}>
          No tenants match your filters.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 12,
          }}
        >
          {rows.map((row) => (
            <TenantCard key={row.id} tenant={row} />
          ))}
        </div>
      )}
    </div>
  );
}
