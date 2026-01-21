import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { startOfDay, endOfDay, subDays, format, isValid } from 'date-fns';

// Helper function to safely parse dates
function safeParseDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  return isValid(date) ? date : null;
}

// GET /api/dashboard - Get dashboard statistics
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;
    const userId = parseInt(searchParams.get('userId') || '1');
    const days = parseInt(searchParams.get('days') || '7');

    const today = new Date();
    const startDate = startOfDay(subDays(today, days - 1));
    const endDate = endOfDay(today);
    const todayStr = format(today, 'yyyy-MM-dd');

    // Get all conversations for user
    const conversationsResult = await db.query(
      `SELECT * FROM conversations WHERE user_id = $1`,
      [userId]
    );
    const conversations = conversationsResult.rows || [];
    const conversationIds = conversations.map((c: any) => c.id);

    // Get all messages
    const messagesResult = await db.query(`SELECT * FROM messages`);
    const allMessages = messagesResult.rows || [];
    
    // Filter messages by conversation and date range
    const messagesInRange = allMessages.filter((m: any) => {
      if (!conversationIds.includes(m.conversation_id)) return false;
      const sentAt = safeParseDate(m.sent_at || m.created_at);
      if (!sentAt) return false;
      return sentAt >= startDate && sentAt <= endDate;
    });

    // Get all appointments
    const appointmentsResult = await db.query(
      `SELECT * FROM appointments WHERE user_id = $1`,
      [userId]
    );
    const allAppointments = appointmentsResult.rows || [];
    
    // Filter appointments by date range
    const appointmentsInRange = allAppointments.filter((a: any) => {
      const startTime = safeParseDate(a.start_time);
      if (!startTime) return false;
      return startTime >= startDate && startTime <= endDate;
    });

    // Get all services
    const servicesResult = await db.query(`SELECT * FROM services`);
    const services = servicesResult.rows || [];
    const servicesMap = new Map(services.map((s: any) => [s.id, s]));

    // Messages per day - ensure we have data for all 7 days
    const messagesPerDayMap = new Map<string, number>();
    
    // Initialize all 7 days with 0
    for (let i = 0; i < days; i++) {
      const date = format(subDays(today, days - 1 - i), 'yyyy-MM-dd');
      messagesPerDayMap.set(date, 0);
    }
    
    // Count actual messages
    messagesInRange.forEach((m: any) => {
      const sentAt = safeParseDate(m.sent_at || m.created_at);
      if (!sentAt) return;
      const date = format(sentAt, 'yyyy-MM-dd');
      if (messagesPerDayMap.has(date)) {
        messagesPerDayMap.set(date, (messagesPerDayMap.get(date) || 0) + 1);
      }
    });
    
    const messagesPerDay = Array.from(messagesPerDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Appointments per day
    const appointmentsPerDayMap = new Map<string, number>();
    appointmentsInRange.forEach((a: any) => {
      const startTime = safeParseDate(a.start_time);
      if (!startTime) return;
      const date = format(startTime, 'yyyy-MM-dd');
      appointmentsPerDayMap.set(date, (appointmentsPerDayMap.get(date) || 0) + 1);
    });
    const appointmentsPerDay = Array.from(appointmentsPerDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Total messages today
    const messagesToday = allMessages.filter((m: any) => {
      if (!conversationIds.includes(m.conversation_id)) return false;
      const sentAt = safeParseDate(m.sent_at || m.created_at);
      if (!sentAt) return false;
      return format(sentAt, 'yyyy-MM-dd') === todayStr;
    }).length;

    // Total appointments today - fix timezone issues
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    const appointmentsToday = allAppointments.filter((a: any) => {
      const startTime = safeParseDate(a.start_time);
      if (!startTime) return false;
      // Compare dates directly without timezone conversion issues
      return startTime >= todayStart && startTime <= todayEnd;
    }).length;

    // Get appointments for today (for display)
    const todayAppointments = allAppointments
      .filter((a: any) => {
        const startTime = safeParseDate(a.start_time);
        if (!startTime) return false;
        return startTime >= todayStart && startTime <= todayEnd;
      })
      .map((a: any) => {
        const service = servicesMap.get(a.service_id);
        return {
          id: a.id,
          client_name: a.client_name,
          service_name: service?.name || 'Unknown',
          start_time: a.start_time,
          end_time: a.end_time,
          status: a.status,
        };
      })
      .sort((a, b) => {
        const aTime = safeParseDate(a.start_time);
        const bTime = safeParseDate(b.start_time);
        if (!aTime || !bTime) return 0;
        return aTime.getTime() - bTime.getTime();
      });

    // Get all clients for user
    const clientsResult = await db.query(
      `SELECT COUNT(*) as total FROM clients WHERE user_id = $1`,
      [userId]
    );
    const totalClients = parseInt(clientsResult.rows[0]?.total || '0');

    // No-show rate
    const noShows = appointmentsInRange.filter((a: any) => a.status === 'no_show').length;
    const totalAppointments = appointmentsInRange.filter((a: any) => 
      ['scheduled', 'completed', 'no_show', 'cancelled'].includes(a.status)
    ).length;
    const noShowRate = totalAppointments > 0 ? (noShows / totalAppointments) * 100 : 0;

    // Estimated revenue
    const estimatedRevenue = appointmentsInRange
      .filter((a: any) => ['scheduled', 'completed'].includes(a.status))
      .reduce((sum: number, a: any) => {
        const service = servicesMap.get(a.service_id);
        return sum + (service?.price || 0);
      }, 0);

    return NextResponse.json({
      messagesPerDay,
      appointmentsPerDay,
      today: {
        messages: messagesToday,
        appointments: appointmentsToday,
        totalClients: totalClients,
        appointmentsList: todayAppointments,
      },
      noShowRate: Math.round(noShowRate * 10) / 10,
      estimatedRevenue: Math.round(estimatedRevenue * 100) / 100,
    });
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error);
    // Return default structure even on error
    return NextResponse.json({
      messagesPerDay: [],
      appointmentsPerDay: [],
      today: {
        messages: 0,
        appointments: 0,
        totalClients: 0,
        appointmentsList: [],
      },
      noShowRate: 0,
      estimatedRevenue: 0,
    });
  }
}

