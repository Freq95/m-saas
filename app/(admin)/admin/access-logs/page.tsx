import { redirect } from 'next/navigation';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';

type AccessLogsPageProps = {
  searchParams?: Promise<{
    route?: string;
    targetType?: string;
    actor?: string;
  }>;
};

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function AdminAccessLogsPage({ searchParams }: AccessLogsPageProps) {
  const superAdmin = await getSuperAdmin().catch(() => null);
  if (!superAdmin) {
    redirect('/login');
  }
  const { userId: actorUserId, email: actorEmail } = superAdmin;

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const route = resolvedSearchParams?.route?.trim();
  const targetType = resolvedSearchParams?.targetType?.trim();
  const actor = resolvedSearchParams?.actor?.trim();

  const filter: Record<string, unknown> = {};
  if (route) {
    filter.route = route;
  }
  if (targetType) {
    filter.target_type = targetType;
  }
  if (actor) {
    const escaped = escapeRegex(actor);
    filter.actor_email = { $regex: escaped, $options: 'i' };
  }

  const db = await getMongoDbOrThrow();
  const logs = await db.collection('data_access_logs').find(filter).sort({ created_at: -1 }).limit(200).toArray();

  await logDataAccess({
    actorUserId,
    actorEmail,
    actorRole: 'super_admin',
    targetType: 'data_access_logs',
    route: '/admin/access-logs',
    metadata: {
      routeFilter: route || null,
      targetType: targetType || null,
      actorFilter: actor || null,
      resultCount: logs.length,
    },
  });

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1>Data Access Logs</h1>
      <p>Most recent 200 read-access events across admin and tenant APIs/pages.</p>

      <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input name="route" placeholder="Route filter" defaultValue={route || ''} />
        <input name="targetType" placeholder="Target type filter" defaultValue={targetType || ''} />
        <input name="actor" placeholder="Actor email filter" defaultValue={actor || ''} />
        <button type="submit">Apply</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Role</th>
            <th>Route</th>
            <th>Target</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log: any) => (
            <tr key={String(log._id)}>
              <td>{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
              <td>{log.actor_email || '-'}</td>
              <td>{log.actor_role || '-'}</td>
              <td>{log.route || '-'}</td>
              <td>
                {log.target_type || '-'}
                {log.target_id !== undefined && log.target_id !== null ? `:${String(log.target_id)}` : ''}
              </td>
              <td>{log.ip || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

