import { NextResponse } from 'next/server';
import { processReminders } from '@/lib/reminders';

// POST /api/reminders/process - Process and send reminders (cron job)
export async function POST() {
  try {
    await processReminders();
    return NextResponse.json({ success: true, message: 'Reminders processed' });
  } catch (error: any) {
    console.error('Error processing reminders:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

