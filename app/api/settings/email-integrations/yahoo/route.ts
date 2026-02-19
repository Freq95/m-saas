import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { saveEmailIntegration } from '@/lib/email-integrations';
import { testYahooConnection } from '@/lib/yahoo-mail';
import { createYahooIntegrationSchema } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { getAuthUser } from '@/lib/auth-helpers';

// POST /api/settings/email-integrations/yahoo
export async function POST(request: NextRequest) {
  try {
    const { userId } = await getAuthUser();
    const body = await request.json();
    
    const validationResult = createYahooIntegrationSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }
    
    const { email, password } = validationResult.data;
    
    // Test connection before saving
    try {
      const testConfig = { email, password, appPassword: password };
      await testYahooConnection(testConfig);
      logger.info('Yahoo connection test successful', { email });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Yahoo connection test failed', { 
        error: errorMessage, 
        email 
      });
      return createErrorResponse(
        errorMessage,
        400
      );
    }
    
    // Save integration
    const integration = await saveEmailIntegration(userId, 'yahoo', email, password);
    
    return createSuccessResponse({ integration }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to save Yahoo integration');
  }
}

