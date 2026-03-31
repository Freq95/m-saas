import { NextRequest } from 'next/server';
import { processReminders } from '@/lib/reminders';
import { createErrorResponse, handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { hasValidCronSecret } from '@/lib/cron-auth';

function isRemindersProcessingEnabled(): boolean {
  return process.env.REMINDERS_PROCESS_ENABLED === 'true';
}

// POST /api/reminders/process - Process and send reminders (cron job)
export async function POST(request: NextRequest) {
  try {
    if (!isRemindersProcessingEnabled()) {
      return createErrorResponse('Reminders processing is disabled', 503);
    }

    if (!hasValidCronSecret(request)) {
      return createErrorResponse('Unauthorized', 401);
    }

    await processReminders();
    return createSuccessResponse({ success: true, message: 'Reminders processed' });
  } catch (error) {
    return handleApiError(error, 'Failed to process reminders');
  }
}

