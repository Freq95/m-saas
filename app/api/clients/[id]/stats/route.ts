import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// GET /api/clients/[id]/stats - Get detailed statistics for a client
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const clientId = parseInt(params.id);

    // Validate ID
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    // Verify client exists
    const clientResult = await db.query(
      `SELECT id FROM clients WHERE id = $1`,
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      return createErrorResponse('Client not found', 404);
    }

    // Calculate total spent from completed appointments
    const spentResult = await db.query(
      `SELECT COALESCE(SUM(s.price), 0) as total
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.client_id = $1 AND a.status = 'completed'`,
      [clientId]
    );
    const totalSpent = parseFloat(spentResult.rows[0]?.total || '0');

    // Count total appointments
    const countResult = await db.query(
      `SELECT COUNT(*) as count
       FROM appointments
       WHERE client_id = $1 AND status IN ('scheduled', 'completed')`,
      [clientId]
    );
    const totalAppointments = parseInt(countResult.rows[0]?.count || '0');

    // Count completed appointments
    const completedResult = await db.query(
      `SELECT COUNT(*) as count
       FROM appointments
       WHERE client_id = $1 AND status = 'completed'`,
      [clientId]
    );
    const completedAppointments = parseInt(completedResult.rows[0]?.count || '0');

    // Count no-show appointments
    const noShowResult = await db.query(
      `SELECT COUNT(*) as count
       FROM appointments
       WHERE client_id = $1 AND status = 'no-show'`,
      [clientId]
    );
    const noShowCount = parseInt(noShowResult.rows[0]?.count || '0');

    // Calculate no-show rate
    const totalScheduled = completedAppointments + noShowCount;
    const noShowRate = totalScheduled > 0 ? (noShowCount / totalScheduled) * 100 : 0;

    // Get last appointment date
    const lastAppResult = await db.query(
      `SELECT MAX(start_time) as last_date
       FROM appointments
       WHERE client_id = $1 AND status IN ('scheduled', 'completed')`,
      [clientId]
    );
    const lastAppointmentDate = lastAppResult.rows[0]?.last_date || null;

    // Get first appointment date
    const firstAppResult = await db.query(
      `SELECT MIN(start_time) as first_date
       FROM appointments
       WHERE client_id = $1 AND status IN ('scheduled', 'completed')`,
      [clientId]
    );
    const firstAppointmentDate = firstAppResult.rows[0]?.first_date || null;

    // Calculate visit frequency (appointments per month)
    let visitFrequency = 0;
    if (firstAppointmentDate && lastAppointmentDate) {
      const firstDate = new Date(firstAppointmentDate);
      const lastDate = new Date(lastAppointmentDate);
      const monthsDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (monthsDiff > 0) {
        visitFrequency = totalAppointments / monthsDiff;
      } else if (totalAppointments > 0) {
        visitFrequency = totalAppointments; // Same month
      }
    }

    // Get preferred services (top 3 most used)
    const preferredServicesResult = await db.query(
      `SELECT 
        s.id,
        s.name,
        COUNT(*) as count,
        SUM(s.price) as total_spent
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.client_id = $1 AND a.status = 'completed'
       GROUP BY s.id, s.name
       ORDER BY count DESC, total_spent DESC
       LIMIT 3`,
      [clientId]
    );

    const preferredServices = preferredServicesResult.rows.map((s: { id: number; name: string; count: string; total_spent: string | null }) => ({
      id: s.id,
      name: s.name,
      count: parseInt(s.count),
      total_spent: parseFloat(s.total_spent || '0'),
    }));

    // Get average appointment value
    const avgValue = completedAppointments > 0 ? totalSpent / completedAppointments : 0;

    // Count conversations
    const conversationsResult = await db.query(
      `SELECT COUNT(*) as count
       FROM conversations
       WHERE client_id = $1`,
      [clientId]
    );
    const totalConversations = parseInt(conversationsResult.rows[0]?.count || '0');

    // Get last conversation date
    const lastConvResult = await db.query(
      `SELECT MAX(updated_at) as last_date
       FROM conversations
       WHERE client_id = $1`,
      [clientId]
    );
    const lastConversationDate = lastConvResult.rows[0]?.last_date || null;

    return createSuccessResponse({
      stats: {
        total_spent: totalSpent,
        total_appointments: totalAppointments,
        completed_appointments: completedAppointments,
        no_show_count: noShowCount,
        no_show_rate: Math.round(noShowRate * 100) / 100,
        average_appointment_value: Math.round(avgValue * 100) / 100,
        visit_frequency: Math.round(visitFrequency * 100) / 100,
        last_appointment_date: lastAppointmentDate,
        first_appointment_date: firstAppointmentDate,
        preferred_services: preferredServices,
        total_conversations: totalConversations,
        last_conversation_date: lastConversationDate,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch client stats');
  }
}

