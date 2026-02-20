import { addHours, format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { getMongoDbOrThrow, getNextNumericId } from './db/mongo-utils';

interface ReminderChannel {
  type: 'sms' | 'whatsapp' | 'email';
  send: (to: string, message: string) => Promise<boolean>;
}

/**
 * Check and send reminders for appointments 24 hours in advance
 */
export async function processReminders() {
  const db = await getMongoDbOrThrow();

  // Get appointments that need reminders (24h before, not yet sent)
  const now = new Date();
  const reminderTime = addHours(now, 24);

  const [appointments, services, users] = await Promise.all([
    db.collection('appointments').find({
      status: 'scheduled',
      reminder_sent: false,
      tenant_id: { $exists: true },
      start_time: {
        $gte: now.toISOString(),
        $lte: reminderTime.toISOString(),
      },
    }).toArray(),
    db.collection('services').find({ tenant_id: { $exists: true } }).toArray(),
    db.collection('users').find({ status: 'active', tenant_id: { $exists: true } }).toArray(),
  ]);

  const activeTenantIds = new Set<string>(
    (
      await db
        .collection('tenants')
        .find({ status: 'active' })
        .project({ _id: 1 })
        .toArray()
    ).map((tenant: any) => String(tenant._id))
  );

  const serviceByTenantAndId = new Map<string, any>(
    services.map((s: any) => [`${String(s.tenant_id)}:${s.id}`, s])
  );
  const userById = new Map<number, any>(
    users
      .filter((u: any) => !u.tenant_id || activeTenantIds.has(String(u.tenant_id)))
      .map((u: any) => [u.id, u])
  );

  for (const appointment of appointments) {
    const service = serviceByTenantAndId.get(`${String(appointment.tenant_id)}:${appointment.service_id}`);
    const user = userById.get(appointment.user_id);
    if (!user) {
      continue;
    }
    const appointmentTime = new Date(appointment.start_time);
    const timeStr = format(appointmentTime, "EEEE, d MMMM 'la' HH:mm", { locale: ro });

    const message = `Buna ${appointment.client_name}! Reamintire programare maine la ora ${format(appointmentTime, 'HH:mm')}${service?.name ? ` pentru ${service.name}` : ''}. Va asteptam!`;

    // Try to send via WhatsApp/SMS if phone is available
    if (appointment.client_phone) {
      try {
        const sent = await sendSMS(appointment.client_phone, message);
        if (sent) {
          const reminderId = await getNextNumericId('reminders');
          const sentAt = new Date().toISOString();
          await db.collection('reminders').insertOne({
            _id: reminderId,
            id: reminderId,
            tenant_id: appointment.tenant_id,
            user_id: appointment.user_id,
            appointment_id: appointment.id,
            channel: 'sms',
            sent_at: sentAt,
            status: 'sent',
            created_at: sentAt,
            updated_at: sentAt,
          });
          await db.collection('appointments').updateOne(
            { id: appointment.id, tenant_id: appointment.tenant_id },
            { $set: { reminder_sent: true, updated_at: sentAt } }
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
        const reminderId = await getNextNumericId('reminders');
        const sentAt = new Date().toISOString();

        if (sent) {
          await db.collection('reminders').insertOne({
            _id: reminderId,
            id: reminderId,
            tenant_id: appointment.tenant_id,
            user_id: appointment.user_id,
            appointment_id: appointment.id,
            channel: 'email',
            sent_at: sentAt,
            status: 'sent',
            created_at: sentAt,
            updated_at: sentAt,
          });
          await db.collection('appointments').updateOne(
            { id: appointment.id, tenant_id: appointment.tenant_id },
            { $set: { reminder_sent: true, updated_at: sentAt } }
          );
        } else {
          await db.collection('reminders').insertOne({
            _id: reminderId,
            id: reminderId,
            tenant_id: appointment.tenant_id,
            user_id: appointment.user_id,
            appointment_id: appointment.id,
            channel: 'email',
            status: 'failed',
            created_at: sentAt,
            updated_at: sentAt,
          });
        }
      } catch (error) {
        console.error(`Failed to send email reminder for appointment ${appointment.id}:`, error);
        const reminderId = await getNextNumericId('reminders');
        const sentAt = new Date().toISOString();
        await db.collection('reminders').insertOne({
          _id: reminderId,
          id: reminderId,
          tenant_id: appointment.tenant_id,
          user_id: appointment.user_id,
          appointment_id: appointment.id,
          channel: 'email',
          status: 'failed',
          created_at: sentAt,
          updated_at: sentAt,
        });
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
