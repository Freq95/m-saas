import { NextRequest } from 'next/server';
import { getYahooConfig, sendYahooEmail } from '@/lib/yahoo-mail';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

// POST /api/yahoo/send - Send email via Yahoo
export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser();
    const body = await request.json();

    // Get config from database (with env fallback)
    const config = await getYahooConfig(userId);

    if (!config) {
      return createErrorResponse(
        'Yahoo Mail not configured. Please configure it in Settings > Email Integrations or set YAHOO_EMAIL and YAHOO_PASSWORD (or YAHOO_APP_PASSWORD) in .env',
        400
      );
    }

    // Validate input
    const { yahooSendSchema } = await import('@/lib/validation');
    const validationResult = yahooSendSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { to, subject, text, html } = validationResult.data;

    // Send email via Yahoo SMTP
    await sendYahooEmail(config, to, subject, text, html);

    return createSuccessResponse({
      success: true,
      message: 'Email sent successfully',
    });
  } catch (error) {
    return handleApiError(error, 'Failed to send email');
  }
}

