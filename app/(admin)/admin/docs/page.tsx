export default function AdminDocsPage() {
  const transitionRows = [
    {
      entity: 'tenant',
      from: 'active',
      to: 'suspended',
      allowed: 'yes',
      sideEffects: 'Disable tenant access; cascade users/memberships to suspended; audit + reason required',
    },
    {
      entity: 'tenant',
      from: 'active',
      to: 'deleted',
      allowed: 'yes',
      sideEffects: 'Soft delete tenant; set deleted_at/deleted_by; cascade users to deleted and memberships to revoked; audit + reason required',
    },
    {
      entity: 'tenant',
      from: 'suspended/deleted',
      to: 'active',
      allowed: 'yes',
      sideEffects: 'Restore tenant; restore only entries disabled_by_tenant; clear tenant delete fields; audit + reason required',
    },
    {
      entity: 'user',
      from: 'active',
      to: 'suspended',
      allowed: 'yes',
      sideEffects: 'Disable login/API access; set team_members to suspended; audit + reason required',
    },
    {
      entity: 'user',
      from: 'active/pending_invite/suspended',
      to: 'deleted',
      allowed: 'yes',
      sideEffects: 'Soft delete user; set deleted_at/deleted_by; set team_members to revoked; audit + reason required',
    },
    {
      entity: 'user',
      from: 'deleted',
      to: 'active',
      allowed: 'yes',
      sideEffects: 'Restore user; clear delete fields; set memberships active; audit + reason required',
    },
    {
      entity: 'user',
      from: 'super_admin(active)',
      to: 'non-active/non-super_admin',
      allowed: 'guarded',
      sideEffects: 'Blocked if this would remove the last active super-admin',
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>Admin Docs</h1>
      <p>
        Compact reference for state transitions and enforcement behavior implemented in this phase. Hard delete is not
        implemented.
      </p>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>State Transition Matrix</h2>
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>From</th>
              <th>To</th>
              <th>Allowed</th>
              <th>Side Effects</th>
            </tr>
          </thead>
          <tbody>
            {transitionRows.map((row) => (
              <tr key={`${row.entity}-${row.from}-${row.to}`}>
                <td>{row.entity}</td>
                <td>{row.from}</td>
                <td>{row.to}</td>
                <td>{row.allowed}</td>
                <td>{row.sideEffects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>Effective Access Rule</h2>
        <p>Access to tenant-scoped routes requires all of:</p>
        <ul>
          <li>`users.status = active`</li>
          <li>`tenants.status = active`</li>
          <li>`team_members.status = active`</li>
        </ul>
        <p>Super-admin routes require an active `super_admin` account.</p>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>Operational Controls</h2>
        <ul>
          <li>Soft delete only (tenant and user). No hard delete path.</li>
          <li>Reason code required for status transitions, delete, restore.</li>
          <li>Audit log entry for all critical admin mutations.</li>
          <li>Restore is available at any time (no SLA cutoff).</li>
          <li>Last active super-admin cannot be removed/deactivated.</li>
        </ul>
      </section>
    </div>
  );
}
