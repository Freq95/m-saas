import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';

// Cleanup classification: feature-flagged (advanced scheduling domain, no core UI dependency).
// GET /api/waitlist - Get waitlist entries for a user
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();

    const db = await getMongoDbOrThrow();
    const waitlist = await db
      .collection('waitlist')
      .find({ user_id: Number(userId), tenant_id: tenantId })
      .sort({ created_at: -1 })
      .toArray();

    return NextResponse.json({ waitlist });
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    return NextResponse.json({ error: 'Failed to fetch waitlist' }, { status: 500 });
  }
}

// POST /api/waitlist - Add entry to waitlist
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const body = await request.json();
    const {
      clientId,
      serviceId,
      providerId,
      preferredDays,
      preferredTimes,
      notes,
    } = body;

    if (!clientId || !serviceId) {
      return NextResponse.json(
        { error: 'clientId and serviceId are required' },
        { status: 400 }
      );
    }

    const db = await getMongoDbOrThrow();

    // Get next ID
    const lastEntry = await db
      .collection('waitlist')
      .find({ tenant_id: tenantId })
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const nextId = lastEntry.length > 0 ? lastEntry[0].id + 1 : 1;

    const entry: any = {
      id: nextId,
      user_id: Number(userId),
      tenant_id: tenantId,
      client_id: parseInt(clientId),
      service_id: parseInt(serviceId),
      preferred_days: preferredDays || [],
      preferred_times: preferredTimes || [],
      notes: notes || '',
      created_at: new Date(),
    };

    if (providerId) entry.provider_id = parseInt(providerId);

    await db.collection('waitlist').insertOne(entry);

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('Error adding to waitlist:', error);
    return NextResponse.json({ error: 'Failed to add to waitlist' }, { status: 500 });
  }
}

// DELETE /api/waitlist?entryId=X - Remove from waitlist
export async function DELETE(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get('entryId');

    if (!entryId) {
      return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
    }

    const db = await getMongoDbOrThrow();
    const result = await db.collection('waitlist').deleteOne({ id: parseInt(entryId), user_id: Number(userId), tenant_id: tenantId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing from waitlist:', error);
    return NextResponse.json({ error: 'Failed to remove from waitlist' }, { status: 500 });
  }
}
