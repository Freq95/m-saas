import { google } from 'googleapis';
import { getMongoDbOrThrow, getNextNumericId, invalidateMongoCache } from './db/mongo-utils';

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

  const db = await getMongoDbOrThrow();

  // Get appointment details
  const appointment = await db.collection('appointments').findOne({
    id: appointmentId,
    user_id: userId,
  });

  if (!appointment) {
    throw new Error('Appointment not found');
  }

  const service = appointment.service_id
    ? await db.collection('services').findOne({ id: appointment.service_id })
    : null;

  oauth2Client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const event = {
    summary: service?.name || 'Programare',
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

    const eventId = response.data.id || null;
    if (!eventId) {
      return null;
    }

    // Save sync record
    const existing = await db.collection('google_calendar_sync').findOne({
      user_id: userId,
      appointment_id: appointmentId,
      calendar_event_id: eventId,
    });

    if (!existing) {
      const syncId = await getNextNumericId('google_calendar_sync');
      const now = new Date().toISOString();
      await db.collection('google_calendar_sync').insertOne({
        _id: syncId,
      id: syncId,
      user_id: userId,
      appointment_id: appointmentId,
      calendar_event_id: eventId as string,
        created_at: now,
        updated_at: now,
      });
      invalidateMongoCache();
    }

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
