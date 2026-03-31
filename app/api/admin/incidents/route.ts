import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logAdminAudit, logDataAccess } from '@/lib/audit';
import {
  INCIDENT_SEVERITY_VALUES,
  INCIDENT_STATUS_VALUES,
  computeDeadlineState,
  computeNotificationDueAt,
  ensureSecurityIncidentIndexes,
  toIsoDateOrThrow,
} from '@/lib/security-incidents';
import {
  notifyAffectedTenantOwners,
  parseAffectedTenantIds,
  summarizeOwnerNotifications,
} from '@/lib/incident-notifications';

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 50);
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(request: NextRequest) {
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    const db = await getMongoDbOrThrow();
    await ensureSecurityIncidentIndexes();

    const status = request.nextUrl.searchParams.get('status')?.trim();
    const severity = request.nextUrl.searchParams.get('severity')?.trim();
    const search = request.nextUrl.searchParams.get('search')?.trim();
    const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '25', 10)));
    const skip = (page - 1) * limit;

    if (status && !INCIDENT_STATUS_VALUES.includes(status as any)) {
      return createErrorResponse('Invalid status filter', 400);
    }
    if (severity && !INCIDENT_SEVERITY_VALUES.includes(severity as any)) {
      return createErrorResponse('Invalid severity filter', 400);
    }

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (search) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { summary: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      db.collection('security_incidents').find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('security_incidents').countDocuments(filter),
    ]);

    const incidents = items.map((incident: any) => ({
      ...incident,
      ...computeDeadlineState(incident),
    }));

    await logDataAccess({
      actorUserId,
      actorEmail,
      actorRole: 'super_admin',
      targetType: 'incident.collection',
      route: '/api/admin/incidents',
      request,
      metadata: {
        status: status || null,
        severity: severity || null,
        search: search || null,
        page,
        limit,
        resultCount: incidents.length,
      },
    });

    return createSuccessResponse({
      incidents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to list incidents');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    const db = await getMongoDbOrThrow();
    await ensureSecurityIncidentIndexes();
    const body = await request.json().catch(() => ({}));

    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const summary = typeof body?.summary === 'string' ? body.summary.trim() : '';
    const severity = INCIDENT_SEVERITY_VALUES.includes(body?.severity) ? body.severity : 'medium';
    const status = INCIDENT_STATUS_VALUES.includes(body?.status) ? body.status : 'open';
    const owner = typeof body?.owner === 'string' ? body.owner.trim() : '';
    const isPersonalDataBreach = body?.isPersonalDataBreach === true || body?.isPersonalDataBreach === 'true';
    const affectedTenantIds = parseAffectedTenantIds(body?.affectedTenantIds);

    if (title.length < 3) {
      return createErrorResponse('Title must be at least 3 characters', 400);
    }
    if (summary.length < 10) {
      return createErrorResponse('Summary must be at least 10 characters', 400);
    }

    const nowIso = new Date().toISOString();
    let discoveredAtIso = nowIso;
    if (body?.discoveredAt !== undefined) {
      try {
        discoveredAtIso = toIsoDateOrThrow(body.discoveredAt, 'discoveredAt');
      } catch (error: any) {
        return createErrorResponse(error?.message || 'Invalid discoveredAt value', 400);
      }
    }

    const incidentId = new ObjectId();
    const initialOwnerNotificationSummary: {
      attempted: number;
      sent: number;
      failed: number;
      skipped: number;
      last_attempt_at: string | null;
      last_sent_at: string | null;
    } = {
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      last_attempt_at: null,
      last_sent_at: null,
    };
    const incidentDoc = {
      _id: incidentId,
      title,
      summary,
      severity,
      status,
      owner: owner || null,
      discovered_at: discoveredAtIso,
      notification_due_at: computeNotificationDueAt(discoveredAtIso),
      regulator_notified_at: null,
      data_subjects_notified_at: null,
      affected_systems: sanitizeStringArray(body?.affectedSystems),
      personal_data_types: sanitizeStringArray(body?.personalDataTypes),
      root_cause: null,
      corrective_actions: sanitizeStringArray(body?.correctiveActions),
      is_personal_data_breach: isPersonalDataBreach,
      affected_tenant_ids: affectedTenantIds,
      owner_notifications: [],
      owner_notification_summary: initialOwnerNotificationSummary,
      timeline: [
        {
          at: nowIso,
          event: 'Incident created',
          actor_user_id: actorUserId,
          actor_email: actorEmail,
          details: null,
        },
      ],
      created_at: nowIso,
      updated_at: nowIso,
    };

    await db.collection('security_incidents').insertOne(incidentDoc);

    let ownerNotifications: any[] = [];
    let ownerNotificationSummary = initialOwnerNotificationSummary;
    if (isPersonalDataBreach && affectedTenantIds.length > 0) {
      ownerNotifications = await notifyAffectedTenantOwners({
        db,
        incident: incidentDoc,
        actorEmail,
        existingNotifications: [],
      });

      if (ownerNotifications.length > 0) {
        ownerNotificationSummary = summarizeOwnerNotifications(ownerNotifications as any);
        const ownerNotificationRunAt = new Date().toISOString();
        await db.collection('security_incidents').updateOne(
          { _id: incidentId },
          {
            $set: {
              owner_notifications: ownerNotifications,
              owner_notification_summary: ownerNotificationSummary,
              updated_at: ownerNotificationRunAt,
            },
            $push: {
              timeline: {
                at: ownerNotificationRunAt,
                event: 'Owner notifications processed',
                actor_user_id: actorUserId,
                actor_email: actorEmail,
                details: `sent=${ownerNotificationSummary.sent}, failed=${ownerNotificationSummary.failed}, skipped=${ownerNotificationSummary.skipped}`,
              },
            } as any,
          }
        );
      }
    }

    await logAdminAudit({
      action: 'incident.create',
      actorUserId,
      actorEmail,
      targetType: 'incident',
      targetId: incidentId,
      request,
      after: {
        title,
        severity,
        status,
        discovered_at: discoveredAtIso,
        notification_due_at: incidentDoc.notification_due_at,
        is_personal_data_breach: isPersonalDataBreach,
        affected_tenants: affectedTenantIds.length,
      },
      metadata: {
        owner_notification_summary: ownerNotificationSummary,
      },
    });

    const responseIncident = {
      ...incidentDoc,
      owner_notifications: ownerNotifications,
      owner_notification_summary: ownerNotificationSummary,
    };

    return createSuccessResponse(
      {
        incident: {
          ...responseIncident,
          ...computeDeadlineState(responseIncident),
        },
      },
      201
    );
  } catch (error) {
    return handleApiError(error, 'Failed to create incident');
  }
}
