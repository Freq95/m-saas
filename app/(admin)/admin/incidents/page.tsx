import { redirect } from 'next/navigation';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';
import { computeDeadlineState } from '@/lib/security-incidents';
import IncidentsClient from './IncidentsClient';

type IncidentsPageProps = {
  searchParams?: Promise<{
    status?: string;
    severity?: string;
    search?: string;
  }>;
};

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function AdminIncidentsPage({ searchParams }: IncidentsPageProps) {
  const superAdmin = await getSuperAdmin().catch(() => null);
  if (!superAdmin) {
    redirect('/login');
  }
  const { userId: actorUserId, email: actorEmail } = superAdmin;

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const status = resolvedSearchParams?.status?.trim();
  const severity = resolvedSearchParams?.severity?.trim();
  const search = resolvedSearchParams?.search?.trim();

  const filter: Record<string, unknown> = {};
  if (status) {
    filter.status = status;
  }
  if (severity) {
    filter.severity = severity;
  }
  if (search) {
    const escaped = escapeRegex(search);
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { summary: { $regex: escaped, $options: 'i' } },
    ];
  }

  const db = await getMongoDbOrThrow();
  const incidents = await db.collection('security_incidents').find(filter).sort({ created_at: -1 }).limit(200).toArray();

  await logDataAccess({
    actorUserId,
    actorEmail,
    actorRole: 'super_admin',
    targetType: 'incident.collection',
    route: '/admin/incidents',
    metadata: {
      status: status || null,
      severity: severity || null,
      search: search || null,
      resultCount: incidents.length,
    },
  });

  const incidentsForClient = incidents.map((incident: any) => ({
    _id: String(incident._id),
    title: incident.title,
    summary: incident.summary,
    severity: incident.severity,
    status: incident.status,
    owner: incident.owner || null,
    discovered_at: incident.discovered_at || null,
    regulator_notified_at: incident.regulator_notified_at || null,
    data_subjects_notified_at: incident.data_subjects_notified_at || null,
    is_personal_data_breach: incident.is_personal_data_breach === true,
    affected_tenant_ids: Array.isArray(incident.affected_tenant_ids)
      ? incident.affected_tenant_ids.map((tenantId: any) => String(tenantId))
      : [],
    owner_notification_summary: incident.owner_notification_summary || null,
    ...computeDeadlineState(incident),
  }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>Security Incidents</h1>
      <p>Use this register to track incident response and the GDPR 72-hour regulator notification window.</p>

      <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input name="search" placeholder="Search title or summary" defaultValue={search || ''} />
        <select name="status" defaultValue={status || ''}>
          <option value="">All status</option>
          <option value="open">open</option>
          <option value="investigating">investigating</option>
          <option value="contained">contained</option>
          <option value="resolved">resolved</option>
          <option value="closed">closed</option>
        </select>
        <select name="severity" defaultValue={severity || ''}>
          <option value="">All severity</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <button type="submit">Apply</button>
      </form>

      <IncidentsClient incidents={incidentsForClient} />
    </div>
  );
}

