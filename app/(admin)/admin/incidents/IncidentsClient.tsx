'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type OwnerNotificationSummary = {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  last_attempt_at?: string | null;
  last_sent_at?: string | null;
};

type IncidentRecord = {
  _id: string;
  title: string;
  summary: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
  owner?: string | null;
  discovered_at?: string | null;
  regulator_notified_at?: string | null;
  data_subjects_notified_at?: string | null;
  is_personal_data_breach?: boolean;
  affected_tenant_ids?: string[];
  owner_notification_summary?: OwnerNotificationSummary | null;
  notificationDueAt?: string | null;
  deadlineStatus?: 'pending' | 'met' | 'overdue';
  hoursUntilDeadline?: number | null;
};

type IncidentsClientProps = {
  incidents: IncidentRecord[];
};

function parseTenantIdsCsv(rawValue: string): string[] {
  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatNotificationSummary(summary?: OwnerNotificationSummary | null): string {
  if (!summary) {
    return 'no notification attempts yet';
  }
  return `attempted=${summary.attempted}, sent=${summary.sent}, failed=${summary.failed}, skipped=${summary.skipped}`;
}

export default function IncidentsClient({ incidents }: IncidentsClientProps) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function createIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);

    setError(null);
    setNotice(null);
    setWorking(true);

    const discoveredAtRaw = String(formData.get('discoveredAt') || '').trim();
    const affectedTenantIds = parseTenantIdsCsv(String(formData.get('affectedTenantIds') || ''));

    const response = await fetch('/api/admin/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: String(formData.get('title') || ''),
        summary: String(formData.get('summary') || ''),
        severity: String(formData.get('severity') || 'medium'),
        owner: String(formData.get('owner') || ''),
        discoveredAt: discoveredAtRaw || undefined,
        isPersonalDataBreach: formData.get('isPersonalDataBreach') === 'on',
        affectedTenantIds,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to create incident');
      setWorking(false);
      return;
    }

    const summary = data?.incident?.owner_notification_summary;
    if (summary && typeof summary === 'object' && summary.attempted > 0) {
      setNotice(`Incident created. Owner notifications: ${formatNotificationSummary(summary)}.`);
    } else {
      setNotice('Incident created. Continue updates in the table below.');
    }
    formElement.reset();
    router.refresh();
    setWorking(false);
  }

  async function updateIncident(event: FormEvent<HTMLFormElement>, incidentId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);

    setError(null);
    setNotice(null);
    setWorking(true);

    const payload: Record<string, unknown> = {
      status: String(formData.get('status') || 'open'),
      note: String(formData.get('note') || ''),
      isPersonalDataBreach: String(formData.get('isPersonalDataBreach') || 'no') === 'yes',
      affectedTenantIds: parseTenantIdsCsv(String(formData.get('affectedTenantIds') || '')),
    };

    const regulatorChoice = String(formData.get('regulatorNotified') || 'keep');
    if (regulatorChoice === 'yes') {
      payload.regulatorNotified = true;
    } else if (regulatorChoice === 'no') {
      payload.regulatorNotified = false;
    }

    const dataSubjectsChoice = String(formData.get('dataSubjectsNotified') || 'keep');
    if (dataSubjectsChoice === 'yes') {
      payload.dataSubjectsNotified = true;
    } else if (dataSubjectsChoice === 'no') {
      payload.dataSubjectsNotified = false;
    }

    if (formData.get('notifyAffectedOwnersNow') === 'on') {
      payload.notifyAffectedOwnersNow = true;
    }
    if (formData.get('forceResendOwnerNotifications') === 'on') {
      payload.forceResendOwnerNotifications = true;
    }

    const response = await fetch(`/api/admin/incidents/${incidentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to update incident');
      setWorking(false);
      return;
    }

    const summary = data?.incident?.owner_notification_summary;
    if (summary && typeof summary === 'object') {
      setNotice(`Incident updated. Owner notifications: ${formatNotificationSummary(summary)}.`);
    } else {
      setNotice('Incident updated.');
    }
    router.refresh();
    setWorking(false);
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={{ border: '1px solid #334155', padding: 12, display: 'grid', gap: 8 }}>
        <h2>Create Incident</h2>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        {notice && <p style={{ color: '#4ade80' }}>{notice}</p>}
        <form onSubmit={createIncident} style={{ display: 'grid', gap: 8, maxWidth: 780 }}>
          <input name="title" placeholder="Incident title" required minLength={3} />
          <textarea name="summary" placeholder="What happened, initial impact, and current risk." required minLength={10} rows={4} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select name="severity" defaultValue="medium">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
            <input name="owner" placeholder="Incident owner (optional)" />
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Discovered at (optional)</span>
              <input type="datetime-local" name="discoveredAt" />
            </label>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" name="isPersonalDataBreach" defaultChecked />
            <span>This is a personal-data breach</span>
          </label>
          <input
            name="affectedTenantIds"
            placeholder="Affected tenant IDs (comma-separated ObjectId values)"
          />
          <button type="submit" disabled={working}>Create Incident</button>
        </form>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>Incident Register</h2>
        {incidents.length === 0 && <p>No incidents found.</p>}
        {incidents.map((incident) => (
          <article key={incident._id} style={{ border: '1px solid #334155', padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <strong>{incident.title}</strong>
              <span>
                severity: {incident.severity} | status: {incident.status}
              </span>
            </div>
            <p>{incident.summary}</p>
            <p>
              72h deadline: {incident.notificationDueAt ? new Date(incident.notificationDueAt).toLocaleString() : '-'} |
              {' '}state: {incident.deadlineStatus || 'pending'} |
              {' '}hours remaining: {incident.hoursUntilDeadline ?? '-'}
            </p>
            <p>
              personal data breach: {incident.is_personal_data_breach ? 'yes' : 'no'} | affected tenants:{' '}
              {incident.affected_tenant_ids?.length ? incident.affected_tenant_ids.join(', ') : '-'}
            </p>
            <p>owner notifications: {formatNotificationSummary(incident.owner_notification_summary)}</p>
            <p>
              regulator notified: {incident.regulator_notified_at ? 'yes' : 'no'} | data subjects notified:{' '}
              {incident.data_subjects_notified_at ? 'yes' : 'no'}
            </p>
            <form onSubmit={(event) => updateIncident(event, incident._id)} style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select name="status" defaultValue={incident.status}>
                  <option value="open">open</option>
                  <option value="investigating">investigating</option>
                  <option value="contained">contained</option>
                  <option value="resolved">resolved</option>
                  <option value="closed">closed</option>
                </select>
                <select name="isPersonalDataBreach" defaultValue={incident.is_personal_data_breach ? 'yes' : 'no'}>
                  <option value="yes">personal-data breach</option>
                  <option value="no">not a personal-data breach</option>
                </select>
                <select name="regulatorNotified" defaultValue="keep">
                  <option value="keep">keep regulator flag</option>
                  <option value="yes">mark regulator notified</option>
                  <option value="no">mark regulator not notified</option>
                </select>
                <select name="dataSubjectsNotified" defaultValue="keep">
                  <option value="keep">keep data-subject flag</option>
                  <option value="yes">mark data-subjects notified</option>
                  <option value="no">mark data-subjects not notified</option>
                </select>
              </div>
              <input
                name="affectedTenantIds"
                defaultValue={(incident.affected_tenant_ids || []).join(', ')}
                placeholder="Affected tenant IDs (comma-separated ObjectId values)"
              />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" name="notifyAffectedOwnersNow" />
                  <span>Notify affected owners now</span>
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" name="forceResendOwnerNotifications" />
                  <span>Force resend already-sent tenants</span>
                </label>
              </div>
              <input name="note" placeholder="Update note (optional)" />
              <button type="submit" disabled={working}>Save Update</button>
            </form>
          </article>
        ))}
      </section>
    </div>
  );
}
