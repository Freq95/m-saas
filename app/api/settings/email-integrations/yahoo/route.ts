import { NextRequest } from 'next/server';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { saveEmailIntegration } from '@/lib/email-integrations';
import { testYahooConnection } from '@/lib/yahoo-mail';
import { createYahooIntegrationSchema } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { getAuthUser } from '@/lib/auth-helpers';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

// POST /api/settings/email-integrations/yahoo
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId, email: actorEmail } = await getAuthUser();
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
    const integration = await saveEmailIntegration(userId, tenantId, 'yahoo', email, password);

    try {
      const db = await getMongoDbOrThrow();
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        null;
      const userAgent = request.headers.get('user-agent') || null;
      await db.collection('audit_logs').insertOne({
        action: 'email_integration.created',
        actor_user_id: String(userId),
        actor_email: actorEmail || null,
        target_type: 'email_integration',
        target_id: String(integration.id),
        tenant_id: tenantId,
        ip,
        user_agent: userAgent,
        metadata: {
          provider: integration.provider,
          email: integration.email,
        },
        created_at: new Date().toISOString(),
      });
    } catch (auditError) {
      logger.warn('Failed to write email integration create audit log', {
        userId,
        integrationId: integration.id,
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
    
    return createSuccessResponse({ integration }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to save Yahoo integration');
  }
}

