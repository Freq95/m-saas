import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/contacts/[id]/notes - Get notes for a contact
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const contactId = parseInt(params.id);

    // Get notes from contact's notes field and also from contact_notes if we have a separate table
    // For now, we'll store notes as activity timeline items
    // We'll create a contact_activities table or use the existing structure
    const result = await db.query(
      `SELECT * FROM contact_notes WHERE contact_id = $1 ORDER BY created_at DESC`,
      [contactId]
    );

    return NextResponse.json({ notes: result.rows || [] });
  } catch (error: any) {
    // If table doesn't exist, return empty array
    if (error.message?.includes('contact_notes')) {
      return NextResponse.json({ notes: [] });
    }
    console.error('Error fetching notes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notes', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/contacts/[id]/notes - Create a note for a contact
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const contactId = parseInt(params.id);
    const body = await request.json();

    const { userId, content } = body;

    if (!userId || !content) {
      return NextResponse.json(
        { error: 'userId and content are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO contact_notes (contact_id, user_id, content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [contactId, userId, content, now, now]
    );

    // Update contact's last_activity_date
    await db.query(
      `UPDATE clients SET last_activity_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [now, contactId]
    );

    return NextResponse.json({ note: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating note:', error);
    return NextResponse.json(
      { error: 'Failed to create note', details: error.message },
      { status: 500 }
    );
  }
}

