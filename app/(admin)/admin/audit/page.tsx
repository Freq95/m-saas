import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

type AuditPageProps = {
  searchParams?: {
    action?: string;
  };
};

export default async function AdminAuditPage({ searchParams }: AuditPageProps) {
  const db = await getMongoDbOrThrow();
  const action = searchParams?.action?.trim();
  const filter: Record<string, unknown> = {};
  if (action) {
    filter.action = action;
  }

  const logs = await db.collection('audit_logs').find(filter).sort({ created_at: -1 }).limit(200).toArray();

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1>Audit Logs</h1>
      <form style={{ display: 'flex', gap: 8 }}>
        <input name="action" placeholder="Filter action (e.g. tenant.update)" defaultValue={action || ''} />
        <button type="submit">Filter</button>
      </form>
      <p>Most recent 200 admin actions.</p>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log: any) => (
            <tr key={String(log._id)}>
              <td>{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
              <td>{log.actor_email || '-'}</td>
              <td>{log.action}</td>
              <td>{log.target_type}:{String(log.target_id)}</td>
              <td>{log.ip || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
