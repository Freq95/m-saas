import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

// Cleanup classification: feature-flagged (advanced scheduling domain, no core UI dependency).
// GET /api/blocked-times - Get blocked times for a date range
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const providerId = searchParams.get('providerId');

    if (!userId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'userId, startDate, and endDate are required' },
        { status: 400 }
      );
    }

    const db = await getMongoDbOrThrow();
    const query: any = {
      user_id: parseInt(userId),
      start_time: { $lte: endDate },
      end_time: { $gte: startDate },
    };

    if (providerId) {
      query.$or = [
        { provider_id: parseInt(providerId) },
        { provider_id: { $exists: false } },
      ];
    }

    const blockedTimes = await db
      .collection('blocked_times')
      .find(query)
      .sort({ start_time: 1 })
      .toArray();

    return NextResponse.json({ blockedTimes });
  } catch (error) {
    console.error('Error fetching blocked times:', error);
    return NextResponse.json({ error: 'Failed to fetch blocked times' }, { status: 500 });
  }
}

// POST /api/blocked-times - Create a blocked time
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, providerId, resourceId, startTime, endTime, reason, recurrence } = body;

    if (!userId || !startTime || !endTime || !reason) {
      return NextResponse.json(
        { error: 'userId, startTime, endTime, and reason are required' },
        { status: 400 }
      );
    }

    const db = await getMongoDbOrThrow();

    // Get next ID
    const lastBlocked = await db
      .collection('blocked_times')
      .find()
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const nextId = lastBlocked.length > 0 ? lastBlocked[0].id + 1 : 1;

    // If recurring, generate recurrence_group_id
    let recurrenceGroupId: number | undefined;
    if (recurrence) {
      recurrenceGroupId = Date.now(); // Use timestamp as group ID
    }

    const blockedTime: any = {
      id: nextId,
      user_id: parseInt(userId),
      start_time: new Date(startTime),
      end_time: new Date(endTime),
      reason,
      created_at: new Date(),
    };

    if (providerId) blockedTime.provider_id = parseInt(providerId);
    if (resourceId) blockedTime.resource_id = parseInt(resourceId);
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
        recurrence,
        recurrenceGroupId
      );

      for (const instance of instances) {
        const lastId = await db
          .collection('blocked_times')
          .find()
          .sort({ id: -1 })
          .limit(1)
          .toArray();
        const instanceId = lastId.length > 0 ? lastId[0].id + 1 : nextId + 1;

        await db.collection('blocked_times').insertOne({
          ...blockedTime,
          id: instanceId,
          start_time: instance.start,
          end_time: instance.end,
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
  recurrence: any,
  groupId: number
): Array<{ start: Date; end: Date }> {
  const instances: Array<{ start: Date; end: Date }> = [];
  const duration = endTime.getTime() - startTime.getTime();

  let currentStart = new Date(startTime);
  let count = 0;
  const maxCount = recurrence.count || 52; // Default max 52 occurrences

  while (count < maxCount) {
    // Calculate next occurrence based on frequency
    if (recurrence.frequency === 'daily') {
      currentStart.setDate(currentStart.getDate() + recurrence.interval);
    } else if (recurrence.frequency === 'weekly') {
      currentStart.setDate(currentStart.getDate() + 7 * recurrence.interval);
    } else if (recurrence.frequency === 'monthly') {
      currentStart.setMonth(currentStart.getMonth() + recurrence.interval);
    }

    // Check end condition
    if (recurrence.end_date && currentStart > new Date(recurrence.end_date)) {
      break;
    }

    const currentEnd = new Date(currentStart.getTime() + duration);
    instances.push({ start: new Date(currentStart), end: currentEnd });

    count++;
  }

  return instances;
}
