import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function overlapsRange(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}

// Cleanup classification: feature-flagged (advanced scheduling domain, no core UI dependency).
// GET /api/blocked-times - Get blocked times for a date range
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const providerId = searchParams.get('providerId');
    const resourceId = searchParams.get('resourceId');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    const db = await getMongoDbOrThrow();
    const userIdNumber = Number(userId);
    const startDateObj = toDate(startDate);
    const endDateObj = toDate(endDate);
    const providerIdNumber = providerId ? Number(providerId) : undefined;
    const resourceIdNumber = resourceId ? Number(resourceId) : undefined;

    if (
      Number.isNaN(userIdNumber) ||
      !startDateObj ||
      !endDateObj ||
      (providerIdNumber !== undefined && Number.isNaN(providerIdNumber)) ||
      (resourceIdNumber !== undefined && Number.isNaN(resourceIdNumber))
    ) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    const blockedTimes = await db
      .collection('blocked_times')
      .find({ user_id: userIdNumber, tenant_id: tenantId })
      .sort({ start_time: 1 })
      .toArray();

    const filtered = blockedTimes.filter((blockedTime: any) => {
      if (providerIdNumber !== undefined && blockedTime.provider_id && blockedTime.provider_id !== providerIdNumber) {
        return false;
      }
      if (resourceIdNumber !== undefined && blockedTime.resource_id && blockedTime.resource_id !== resourceIdNumber) {
        return false;
      }

      const start = toDate(blockedTime.start_time);
      const end = toDate(blockedTime.end_time);
      if (!start || !end) return false;
      return overlapsRange(start, end, startDateObj, endDateObj);
    }).map((blockedTime: any) => {
      const start = toDate(blockedTime.start_time);
      const end = toDate(blockedTime.end_time);
      return {
        ...blockedTime,
        start_time: start ? start.toISOString() : blockedTime.start_time,
        end_time: end ? end.toISOString() : blockedTime.end_time,
      };
    });

    return NextResponse.json({ blockedTimes: filtered });
  } catch (error) {
    console.error('Error fetching blocked times:', error);
    return NextResponse.json({ error: 'Failed to fetch blocked times' }, { status: 500 });
  }
}

// POST /api/blocked-times - Create a blocked time
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const body = await request.json();
    const { providerId, resourceId, startTime, endTime, reason, recurrence } = body;

    if (!startTime || !endTime || !reason) {
      return NextResponse.json(
        { error: 'startTime, endTime, and reason are required' },
        { status: 400 }
      );
    }

    const db = await getMongoDbOrThrow();
    const userIdNumber = Number(userId);
    const providerIdNumber = providerId ? Number(providerId) : undefined;
    const resourceIdNumber = resourceId ? Number(resourceId) : undefined;
    const startDateObj = toDate(startTime);
    const endDateObj = toDate(endTime);

    if (
      Number.isNaN(userIdNumber) ||
      !startDateObj ||
      !endDateObj ||
      startDateObj >= endDateObj ||
      (providerIdNumber !== undefined && Number.isNaN(providerIdNumber)) ||
      (resourceIdNumber !== undefined && Number.isNaN(resourceIdNumber))
    ) {
      return NextResponse.json({ error: 'Invalid input fields' }, { status: 400 });
    }

    const nextId = await getNextNumericId('blocked_times');

    // If recurring, generate recurrence_group_id
    let recurrenceGroupId: number | undefined;
    if (recurrence) {
      recurrenceGroupId = Date.now(); // Use timestamp as group ID
    }

    const blockedTime: any = {
      _id: nextId,
      id: nextId,
      tenant_id: tenantId,
      user_id: userIdNumber,
      start_time: startDateObj.toISOString(),
      end_time: endDateObj.toISOString(),
      reason,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (providerIdNumber) blockedTime.provider_id = providerIdNumber;
    if (resourceIdNumber) blockedTime.resource_id = resourceIdNumber;
    if (recurrence) {
      blockedTime.recurrence = recurrence;
      blockedTime.recurrence_group_id = recurrenceGroupId;
    }

    await db.collection('blocked_times').insertOne(blockedTime);

    // If recurring, create additional instances
    if (recurrence && recurrenceGroupId) {
      const instances = generateRecurringInstances(
        new Date(startTime),
        new Date(endTime),
        recurrence
      );

      for (const instance of instances) {
        const instanceId = await getNextNumericId('blocked_times');

        await db.collection('blocked_times').insertOne({
          ...blockedTime,
          _id: instanceId,
          id: instanceId,
          start_time: instance.start.toISOString(),
          end_time: instance.end.toISOString(),
          recurrence_group_id: recurrenceGroupId,
        });
      }
    }

    return NextResponse.json({ blockedTime, recurrenceGroupId }, { status: 201 });
  } catch (error) {
    console.error('Error creating blocked time:', error);
    return NextResponse.json({ error: 'Failed to create blocked time' }, { status: 500 });
  }
}

// Helper function to generate recurring instances
function generateRecurringInstances(
  startTime: Date,
  endTime: Date,
  recurrence: any
): Array<{ start: Date; end: Date }> {
  const instances: Array<{ start: Date; end: Date }> = [];
  const duration = endTime.getTime() - startTime.getTime();
  const safeInterval = Math.max(1, Number(recurrence.interval) || 1);

  let currentStart = new Date(startTime);
  let count = 0;
  const maxCount = recurrence.count || 52; // Default max 52 occurrences

  while (count < maxCount) {
    // Calculate next occurrence based on frequency
    if (recurrence.frequency === 'daily') {
      currentStart.setDate(currentStart.getDate() + safeInterval);
    } else if (recurrence.frequency === 'weekly') {
      currentStart.setDate(currentStart.getDate() + 7 * safeInterval);
    } else if (recurrence.frequency === 'monthly') {
      currentStart.setMonth(currentStart.getMonth() + safeInterval);
    }

    // Check end condition
    const recurrenceEndDate = recurrence.end_date || recurrence.endDate;
    if (recurrenceEndDate && currentStart > new Date(recurrenceEndDate)) {
      break;
    }

    const currentEnd = new Date(currentStart.getTime() + duration);
    instances.push({ start: new Date(currentStart), end: currentEnd });

    count++;
  }

  return instances;
}
