import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';

// Cleanup classification: feature-flagged (advanced scheduling domain, no core UI dependency).
// GET /api/providers - List all providers for a user
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();

    const db = await getMongoDbOrThrow();
    const providers = await db
      .collection('providers')
      .find({ user_id: Number(userId), tenant_id: tenantId, is_active: true })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({ providers });
  } catch (error) {
    console.error('Error fetching providers:', error);
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
  }
}

// POST /api/providers - Create a new provider
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const body = await request.json();
    const { name, email, role, color, workingHours } = body;

    if (!name || !email || !role) {
      return NextResponse.json(
        { error: 'name, email, and role are required' },
        { status: 400 }
      );
    }

    const db = await getMongoDbOrThrow();

    // Get next ID
    const lastProvider = await db
      .collection('providers')
      .find({ tenant_id: tenantId })
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const nextId = lastProvider.length > 0 ? lastProvider[0].id + 1 : 1;

    const provider = {
      id: nextId,
      user_id: Number(userId),
      tenant_id: tenantId,
      name,
      email,
      role,
      color: color || '#3b82f6',
      working_hours: workingHours || {
        monday: { start: '09:00', end: '17:00', breaks: [] },
        tuesday: { start: '09:00', end: '17:00', breaks: [] },
        wednesday: { start: '09:00', end: '17:00', breaks: [] },
        thursday: { start: '09:00', end: '17:00', breaks: [] },
        friday: { start: '09:00', end: '17:00', breaks: [] },
      },
      is_active: true,
      created_at: new Date(),
    };

    await db.collection('providers').insertOne(provider);

    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    console.error('Error creating provider:', error);
    return NextResponse.json({ error: 'Failed to create provider' }, { status: 500 });
  }
}
