import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';

// Cleanup classification: feature-flagged (advanced scheduling domain, no core UI dependency).
// GET /api/resources - List all resources for a user
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();

    const db = await getMongoDbOrThrow();
    const resources = await db
      .collection('resources')
      .find({ user_id: Number(userId), tenant_id: tenantId, is_active: true })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({ resources });
  } catch (error) {
    console.error('Error fetching resources:', error);
    return NextResponse.json({ error: 'Failed to fetch resources' }, { status: 500 });
  }
}

// POST /api/resources - Create a new resource
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const body = await request.json();
    const { name, type } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: 'name and type are required' },
        { status: 400 }
      );
    }

    if (!['chair', 'room', 'equipment'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be chair, room, or equipment' },
        { status: 400 }
      );
    }

    const db = await getMongoDbOrThrow();

    // Get next ID
    const lastResource = await db
      .collection('resources')
      .find({ tenant_id: tenantId })
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const nextId = lastResource.length > 0 ? lastResource[0].id + 1 : 1;

    const resource = {
      id: nextId,
      user_id: Number(userId),
      tenant_id: tenantId,
      name,
      type,
      is_active: true,
      created_at: new Date(),
    };

    await db.collection('resources').insertOne(resource);

    return NextResponse.json({ resource }, { status: 201 });
  } catch (error) {
    console.error('Error creating resource:', error);
    return NextResponse.json({ error: 'Failed to create resource' }, { status: 500 });
  }
}
