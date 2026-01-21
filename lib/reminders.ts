import { getDb } from './db';
import { addHours, isBefore, format } from 'date-fns';
import { ro } from 'date-fns/locale';

interface ReminderChannel {
  type: 'sms' | 'whatsapp' | 'email';
  send: (to: string, message: string) => Promise<boolean>;
}

/**
 * Check and send reminders for appointments 24 hours in advance
 */
export async function processReminders() {
  const db = getDb();
  
  // Get appointments that need reminders (24h before, not yet sent)
  const now = new Date();
  const reminderTime = addHours(now, 24);
  
  const appointmentsResult = await db.query(
    `SELECT a.id, a.start_time, a.client_name, a.client_phone, a.client_email, 
            s.name as service_name, u.name as business_name
     FROM appointments a
     LEFT JOIN services s ON a.service_id = s.id
     LEFT JOIN users u ON a.user_id = u.id
     WHERE a.status = 'scheduled'
       AND a.reminder_sent = FALSE
       AND a.start_time >= $1
       AND a.start_time <= $2`,
    [now, reminderTime]
  );

  for (const appointment of appointmentsResult.rows) {
    const appointmentTime = new Date(appointment.start_time);
    const timeStr = format(appointmentTime, "EEEE, d MMMM 'la' HH:mm", { locale: ro });
    
    const message = `Bună ${appointment.client_name}! Reamintire programare mâine la ora ${format(appointmentTime, 'HH:mm')}${appointment.service_name ? ` pentru ${appointment.service_name}` : ''}. Vă așteptăm!`;

    // Try to send via WhatsApp/SMS if phone is available
    if (appointment.client_phone) {
      try {
        const sent = await sendSMS(appointment.client_phone, message);
        if (sent) {
          await db.query(
            `INSERT INTO reminders (appointment_id, channel, sent_at, status)
             VALUES ($1, 'sms', CURRENT_TIMESTAMP, 'sent')`,
            [appointment.id]
          );
          await db.query(
            `UPDATE appointments SET reminder_sent = TRUE WHERE id = $1`,
            [appointment.id]
          );
          continue;
        }
      } catch (error) {
        console.error(`Failed to send SMS reminder for appointment ${appointment.id}:`, error);
      }
    }

    // Fallback to email
    if (appointment.client_email) {
      try {
        const sent = await sendEmail(appointment.client_email, 'Reamintire programare', message);
        if (sent) {
          await db.query(
            `INSERT INTO reminders (appointment_id, channel, sent_at, status)
             VALUES ($1, 'email', CURRENT_TIMESTAMP, 'sent')`,
            [appointment.id]
          );
          await db.query(
            `UPDATE appointments SET reminder_sent = TRUE WHERE id = $1`,
            [appointment.id]
          );
        }
      } catch (error) {
        console.error(`Failed to send email reminder for appointment ${appointment.id}:`, error);
        await db.query(
          `INSERT INTO reminders (appointment_id, channel, status)
           VALUES ($1, 'email', 'failed')`,
          [appointment.id]
        );
      }
    }
  }
}

/**
 * Send SMS via Twilio (or similar provider)
 */
async function sendSMS(phone: string, message: string): Promise<boolean> {
  // TODO: Implement Twilio integration
  // For now, return false to fallback to email
  if (!process.env.TWILIO_ACCOUNT_SID) {
    return false;
  }

  // Twilio implementation would go here
  // const twilio = require('twilio');
  // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // await client.messages.create({
  //   body: message,
  //   from: process.env.TWILIO_PHONE_NUMBER,
  //   to: phone
  // });

  return false;
}

/**
 * Send email reminder
 */
async function sendEmail(to: string, subject: string, message: string): Promise<boolean> {
  const nodemailer = require('nodemailer');
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email not configured, skipping email reminder');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text: message,
    });

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

