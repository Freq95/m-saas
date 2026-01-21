import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';

// Validation schemas
const createReminderSchema = z.object({
  appointmentId: z.number().int().positive(),
  channel: z.enum(['sms', 'whatsapp', 'email']),
  message: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
});

const updateReminderSchema = z.object({
  status: z.enum(['pending', 'sent', 'failed']).optional(),
  channel: z.enum(['sms', 'whatsapp', 'email']).optional(),
  sentAt: z.string().datetime().optional(),
});

// GET /api/reminders - Get all reminders
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;
    const userId = parseInt(searchParams.get('userId') || '1');
    const appointmentId = searchParams.get('appointmentId');
    const status = searchParams.get('status');
    const channel = searchParams.get('channel');

    let query = `
      SELECT r.*, a.client_name, a.client_email, a.client_phone, a.start_time as appointment_time
      FROM reminders r
      LEFT JOIN appointments a ON r.appointment_id = a.id
      WHERE a.user_id = $1
    `;
    const params: any[] = [userId];

    if (appointmentId) {
      query += ` AND r.appointment_id = $${params.length + 1}`;
      params.push(parseInt(appointmentId));
    }

    if (status) {
      query += ` AND r.status = $${params.length + 1}`;
      params.push(status);
    }

    if (channel) {
      query += ` AND r.channel = $${params.length + 1}`;
      params.push(channel);
    }

    query += ` ORDER BY r.created_at DESC`;

    const result = await db.query(query, params);
    
    return NextResponse.json({ 
      reminders: result.rows || [],
      count: result.rows?.length || 0
    });
  } catch (error: any) {
    console.error('Error fetching reminders:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch reminders',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// POST /api/reminders - Create a new reminder
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    
    // Validate input
    const validationResult = createReminderSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { appointmentId, channel, message, scheduledAt } = validationResult.data;

    // Verify appointment exists and belongs to user
    const appointmentResult = await db.query(
      `SELECT a.*, u.id as user_id 
       FROM appointments a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.id = $1`,
      [appointmentId]
    );

    if (appointmentResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    const appointment = appointmentResult.rows[0];

    // Create reminder
    const result = await db.query(
      `INSERT INTO reminders (appointment_id, channel, message, status, scheduled_at, created_at)
       VALUES ($1, $2, $3, 'pending', $4, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        appointmentId,
        channel,
        message || null,
        scheduledAt ? new Date(scheduledAt) : null
      ]
    );

    return NextResponse.json({ 
      reminder: result.rows[0],
      success: true
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating reminder:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create reminder',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

