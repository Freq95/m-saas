import { google } from 'googleapis';
import { getDb } from './db';

let oauth2Client: any = null;

export function initGoogleCalendar() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn('Google Calendar API not configured');
    return null;
  }

  oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
  );

  return oauth2Client;
}

/**
 * Export appointment to Google Calendar
 */
export async function exportToGoogleCalendar(
  userId: number,
  appointmentId: number,
  accessToken: string
): Promise<string | null> {
  if (!oauth2Client) {
    initGoogleCalendar();
  }

  if (!oauth2Client) {
    return null;
  }

  const db = getDb();
  
  // Get appointment details
  const appointmentResult = await db.query(
    `SELECT a.*, s.name as service_name, s.duration_minutes
     FROM appointments a
     LEFT JOIN services s ON a.service_id = s.id
     WHERE a.id = $1 AND a.user_id = $2`,
    [appointmentId, userId]
  );

  if (appointmentResult.rows.length === 0) {
    throw new Error('Appointment not found');
  }

  const appointment = appointmentResult.rows[0];
  
  oauth2Client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const event = {
    summary: appointment.service_name || 'Programare',
    description: appointment.notes || '',
    start: {
      dateTime: new Date(appointment.start_time).toISOString(),
      timeZone: 'Europe/Bucharest',
    },
    end: {
      dateTime: new Date(appointment.end_time).toISOString(),
      timeZone: 'Europe/Bucharest',
    },
    attendees: appointment.client_email ? [{ email: appointment.client_email }] : [],
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    const eventId = response.data.id;
    
    // Save sync record
    await db.query(
      `INSERT INTO google_calendar_sync (user_id, appointment_id, calendar_event_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, appointmentId, eventId]
    );

    return eventId;
  } catch (error) {
    console.error('Error exporting to Google Calendar:', error);
    throw error;
  }
}

/**
 * Get Google Calendar authorization URL
 */
export function getAuthUrl(): string {
  if (!oauth2Client) {
    initGoogleCalendar();
  }

  if (!oauth2Client) {
    throw new Error('Google Calendar not configured');
  }

  const scopes = ['https://www.googleapis.com/auth/calendar.events'];
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
}

