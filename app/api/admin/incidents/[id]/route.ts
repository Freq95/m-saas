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
import { checkUpdateRateLimit } from '@/lib/rate-limit';

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 50);
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    await ensureSecurityIncidentIndexes();
    if (!ObjectId.isValid(params.id)) {
      return createErrorResponse('Invalid incident id', 400);
    }

    const incidentId = new ObjectId(params.id);
    const db = await getMongoDbOrThrow();
    const incident = await db.collection('security_incidents').findOne({ _id: incidentId });
    if (!incident) {
      return createErrorResponse('Incident not found', 404);
    }

    await logDataAccess({
      actorUserId,
      actorEmail,
      actorRole: 'super_admin',
      targetType: 'incident',
      targetId: incidentId,
      route: `/api/admin/incidents/${params.id}`,
      request,
    });

    return createSuccessResponse({
      incident: {
        ...incident,
        ...computeDeadlineState(incident as any),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch incident');
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    const limited = await checkUpdateRateLimit(String(actorUserId));
    if (limited) return limited;
    await ensureSecurityIncidentIndexes();
    if (!ObjectId.isValid(params.id)) {
      return createErrorResponse('Invalid incident id', 400);
    }

    const incidentId = new ObjectId(params.id);
    const db = await getMongoDbOrThrow();
    const body = await request.json().catch(() => ({}));
    const before = await db.collection('security_incidents').findOne({ _id: incidentId });
    if (!before) {
      return createErrorResponse('Incident not found', 404);
    }
    const notifyAffectedOwnersNow = body?.notifyAffectedOwnersNow === true || body?.notifyAffectedOwnersNow === 'true';
    const forceResendOwnerNotifications =
      body?.forceResendOwnerNotifications === true || body?.forceResendOwnerNotifications === 'true';

    const updates: Record<string, unknown> = {};

    if (body?.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length < 3) {
        return createErrorResponse('Title must be at least 3 characters', 400);
      }
      updates.title = body.title.trim();
    }

    if (body?.summary !== undefined) {
      if (typeof body.summary !== 'string' || body.summary.trim().length < 10) {
        return createErrorResponse('Summary must be at least 10 characters', 400);
      }
      updates.summary = body.summary.trim();
    }

    if (body?.severity !== undefined) {
      if (!INCIDENT_SEVERITY_VALUES.includes(body.severity)) {
        return createErrorResponse('Invalid severity', 400);
      }
      updates.severity = body.severity;
    }

    if (body?.status !== undefined) {
      if (!INCIDENT_STATUS_VALUES.includes(body.status)) {
        return createErrorResponse('Invalid status', 400);
      }
      updates.status = body.status;
    }

    if (body?.owner !== undefined) {
      updates.owner = typeof body.owner === 'string' && body.owner.trim() ? body.owner.trim() : null;
    }

    if (body?.isPersonalDataBreach !== undefined) {
      updates.is_personal_data_breach = body.isPersonalDataBreach === true || body.isPersonalDataBreach === 'true';
    }

    if (body?.affectedTenantIds !== undefined) {
      updates.affected_tenant_ids = parseAffectedTenantIds(body.affectedTenantIds);
    }

    if (body?.discoveredAt !== undefined) {
      try {
        const discoveredAt = toIsoDateOrThrow(body.discoveredAt, 'discoveredAt');
        updates.discovered_at = discoveredAt;
        updates.notification_due_at = computeNotificationDueAt(discoveredAt);
      } catch (error: any) {
        return createErrorResponse(error?.message || 'Invalid discoveredAt value', 400);
      }
    }

    if (body?.regulatorNotifiedAt !== undefined) {
      if (body.regulatorNotifiedAt === null || body.regulatorNotifiedAt === '') {
        updates.regulator_notified_at = null;
      } else {
        try {
          updates.regulator_notified_at = toIsoDateOrThrow(body.regulatorNotifiedAt, 'regulatorNotifiedAt');
        } catch (error: any) {
          return createErrorResponse(error?.message || 'Invalid regulatorNotifiedAt value', 400);
        }
      }
    } else if (body?.regulatorNotified === true) {
      updates.regulator_notified_at = before.regulator_notified_at || new Date().toISOString();
    } else if (body?.regulatorNotified === false) {
      updates.regulator_notified_at = null;
    }

    if (body?.dataSubjectsNotifiedAt !== undefined) {
      if (body.dataSubjectsNotifiedAt === null || body.dataSubjectsNotifiedAt === '') {
        updates.data_subjects_notified_at = null;
      } else {
        try {
          updates.data_subjects_notified_at = toIsoDateOrThrow(body.dataSubjectsNotifiedAt, 'dataSubjectsNotifiedAt');
        } catch (error: any) {
          return createErrorResponse(error?.message || 'Invalid dataSubjectsNotifiedAt value', 400);
        }
      }
    } else if (body?.dataSubjectsNotified === true) {
      updates.data_subjects_notified_at = before.data_subjects_notified_at || new Date().toISOString();
    } else if (body?.dataSubjectsNotified === false) {
      updates.data_subjects_notified_at = null;
    }

    if (body?.affectedSystems !== undefined) {
      updates.affected_systems = sanitizeStringArray(body.affectedSystems);
    }

    if (body?.personalDataTypes !== undefined) {
      updates.personal_data_types = sanitizeStringArray(body.personalDataTypes);
    }

    if (body?.correctiveActions !== undefined) {
      updates.corrective_actions = sanitizeStringArray(body.correctiveActions);
    }

    if (body?.rootCause !== undefined) {
      updates.root_cause = typeof body.rootCause === 'string' && body.rootCause.trim() ? body.rootCause.trim() : null;
    }

    const note = typeof body?.note === 'string' ? body.note.trim() : '';
    const requestedPersonalDataBreach = Object.prototype.hasOwnProperty.call(updates, 'is_personal_data_breach')
      ? updates.is_personal_data_breach === true
      : before.is_personal_data_breach === true;
    if (notifyAffectedOwnersNow && !requestedPersonalDataBreach) {
      return createErrorResponse('Cannot notify owners unless incident is marked as personal-data breach', 400);
    }
    const changedFieldNames = Object.keys(updates);
    if (changedFieldNames.length === 0 && !note && !notifyAffectedOwnersNow) {
      return createErrorResponse('No valid updates provided', 400);
    }

    const nowIso = new Date().toISOString();
    updates.updated_at = nowIso;

    const timelineEntry = {
      at: nowIso,
      event:
        typeof updates.status === 'string' && updates.status !== before.status
          ? `Status changed from ${before.status} to ${updates.status}`
          : 'Incident updated',
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      details: note || (changedFieldNames.length ? `Updated fields: ${changedFieldNames.join(', ')}` : null),
    };

    await db.collection('security_incidents').updateOne(
      { _id: incidentId },
      {
        $set: updates,
        $push: { timeline: timelineEntry } as any,
      }
    );

    let incident = await db.collection('security_incidents').findOne({ _id: incidentId });
    const effectivePersonalDataBreach =
      incident?.is_personal_data_breach === true || (incident?.is_personal_data_breach === undefined && before.is_personal_data_breach === true);

    const shouldAttemptOwnerNotifications =
      !!incident &&
      effectivePersonalDataBreach &&
      parseAffectedTenantIds(incident.affected_tenant_ids).length > 0 &&
      (notifyAffectedOwnersNow ||
        Object.prototype.hasOwnProperty.call(updates, 'affected_tenant_ids') ||
        (!before.is_personal_data_breach && effectivePersonalDataBreach));

    let ownerNotificationAttempts: any[] = [];
    let ownerNotificationSummary = incident?.owner_notification_summary || before.owner_notification_summary || null;
    if (shouldAttemptOwnerNotifications && incident) {
      const existingOwnerNotifications = Array.isArray(incident.owner_notifications)
        ? incident.owner_notifications
        : Array.isArray(before.owner_notifications)
          ? before.owner_notifications
          : [];

      ownerNotificationAttempts = await notifyAffectedTenantOwners({
        db,
        incident: incident as any,
        actorEmail,
        existingNotifications: existingOwnerNotifications,
        forceResend: forceResendOwnerNotifications,
      });

      if (ownerNotificationAttempts.length > 0) {
        const mergedOwnerNotifications = [...existingOwnerNotifications, ...ownerNotificationAttempts];
        ownerNotificationSummary = summarizeOwnerNotifications(mergedOwnerNotifications as any);
        const ownerNotificationRunAt = new Date().toISOString();

        await db.collection('security_incidents').updateOne(
          { _id: incidentId },
          {
            $set: {
              owner_notifications: mergedOwnerNotifications,
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
        incident = await db.collection('security_incidents').findOne({ _id: incidentId });
      }
    }

    await logAdminAudit({
      action: 'incident.update',
      actorUserId,
      actorEmail,
      targetType: 'incident',
      targetId: incidentId,
      request,
      before: {
        title: before.title,
        severity: before.severity,
        status: before.status,
        regulator_notified_at: before.regulator_notified_at || null,
        data_subjects_notified_at: before.data_subjects_notified_at || null,
      },
      after: incident
        ? {
            title: incident.title,
            severity: incident.severity,
            status: incident.status,
            regulator_notified_at: incident.regulator_notified_at || null,
            data_subjects_notified_at: incident.data_subjects_notified_at || null,
          }
        : null,
      metadata: {
        updated_fields: changedFieldNames,
        note: note || null,
        owner_notification_attempts: ownerNotificationAttempts.length,
        owner_notification_summary: ownerNotificationSummary,
      },
    });

    return createSuccessResponse({
      incident: incident
        ? {
            ...incident,
            ...computeDeadlineState(incident as any),
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update incident');
  }
}
