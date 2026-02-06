import { NextResponse } from 'next/server';
import { processReminders } from '@/lib/reminders';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';

// POST /api/reminders/process - Process and send reminders (cron job)
export async function POST() {
  try {
    await processReminders();
    return createSuccessResponse({ success: true, message: 'Reminders processed' });
  } catch (error) {
    return handleApiError(error, 'Failed to process reminders');
  }
}

