import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isSlotAvailable } from '@/lib/calendar';
import { exportToGoogleCalendar } from '@/lib/google-calendar';

// GET /api/appointments - Get appointments
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || '1';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');

    let query = `
      SELECT a.*, s.name as service_name, s.duration_minutes, s.price as service_price
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.user_id = $1
    `;

    const params: any[] = [userId];

    if (startDate) {
      query += ` AND a.start_time >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND a.start_time <= $${params.length + 1}`;
      params.push(endDate);
    }

    if (status) {
      query += ` AND a.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY a.start_time ASC`;

    const result = await db.query(query, params);

    return NextResponse.json({ appointments: result.rows });
  } catch (error: any) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/appointments - Create appointment
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    
    // Validate input
    const { createAppointmentSchema } = await import('@/lib/validation');
    const validationResult = createAppointmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const {
      userId,
      conversationId,
      serviceId,
      clientName,
      clientEmail,
      clientPhone,
      startTime,
      endTime,
      notes,
      exportToGoogle,
      googleAccessToken,
    } = validationResult.data;

    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
    
    // Calculate end time if not provided
    let end: Date;
    if (endTime) {
      end = typeof endTime === 'string' ? new Date(endTime) : endTime;
    } else {
      // Get service duration to calculate end time
      const serviceResult = await db.query(
        `SELECT duration_minutes FROM services WHERE id = $1`,
        [serviceId]
      );
      const durationMinutes = serviceResult.rows[0]?.duration_minutes || 60;
      end = new Date(start);
      end.setMinutes(end.getMinutes() + durationMinutes);
    }

    // Check if slot is available
    const available = await isSlotAvailable(parseInt(userId), start, end);
    if (!available) {
      return NextResponse.json(
        { error: 'Time slot is not available' },
        { status: 400 }
      );
    }

    // Find or create client
    const { findOrCreateClient, linkAppointmentToClient } = await import('@/lib/client-matching');
    const client = await findOrCreateClient(
      userId,
      clientName,
      clientEmail,
      clientPhone,
      conversationId ? 'conversation' : 'walk-in'
    );

    // Create appointment
    const result = await db.query(
      `INSERT INTO appointments 
       (user_id, conversation_id, service_id, client_id, client_name, client_email, client_phone, start_time, end_time, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, conversationId, serviceId, client.id, clientName, clientEmail, clientPhone, start, end, notes]
    );

    const appointment = result.rows[0];

    // Link appointment to client and update stats
    await linkAppointmentToClient(appointment.id, client.id);

    // Export to Google Calendar if requested
    if (exportToGoogle && googleAccessToken) {
      try {
        const eventId = await exportToGoogleCalendar(
          parseInt(userId),
          appointment.id,
          googleAccessToken
        );
        if (eventId) {
          appointment.googleCalendarEventId = eventId;
        }
      } catch (error) {
        console.error('Failed to export to Google Calendar:', error);
        // Don't fail the appointment creation if Google export fails
      }
    }

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create appointment',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

