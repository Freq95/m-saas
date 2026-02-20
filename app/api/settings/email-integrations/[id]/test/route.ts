import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getEmailIntegrationById, getEmailIntegrationConfig } from '@/lib/email-integrations';
import { fetchYahooEmails } from '@/lib/yahoo-mail';
import { logger } from '@/lib/logger';
import { integrationIdParamSchema } from '@/lib/validation';
import { getAuthUser, requireRole } from '@/lib/auth-helpers';

// POST /api/settings/email-integrations/[id]/test
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, tenantId, role } = await getAuthUser();
    requireRole(role, 'owner');
    // Validate route parameter
    const paramValidation = integrationIdParamSchema.safeParse({ id: params.id });
    if (!paramValidation.success) {
      return createErrorResponse('Invalid integration ID', 400, JSON.stringify(paramValidation.error.errors));
    }
    
    const integrationId = paramValidation.data.id;
    // Get integration to check provider
    const integration = await getEmailIntegrationById(integrationId, userId, tenantId);
    
    if (!integration) {
      logger.warn('Integration not found for test', { integrationId, userId });
      return createErrorResponse('Integration not found', 404);
    }
    
    logger.info('Testing integration', { integrationId, provider: integration.provider, email: integration.email });
    
    // Decrypt password directly from integration
    let password: string | null = null;
    if (integration.encrypted_password) {
      try {
        const { decrypt } = await import('@/lib/encryption');
        password = decrypt(integration.encrypted_password);
        logger.info('Password decrypted successfully');
      } catch (error) {
        logger.error('Failed to decrypt password', { error, integrationId });
        return createErrorResponse('Failed to decrypt password. Please check ENCRYPTION_KEY is set correctly.', 500);
      }
    }
    
    if (!password) {
      logger.warn('No password found for integration', { integrationId });
      return createErrorResponse('Integration not configured - no password found', 404);
    }
    
    // Test connection based on provider
    if (integration.provider === 'yahoo') {
      const testConfig = {
        email: integration.email,
        password: password,
        appPassword: password,
      };
      
      try {
        const { testYahooConnection } = await import('@/lib/yahoo-mail');
        await testYahooConnection(testConfig);
        logger.info('Connection test successful', { integrationId });
        return createSuccessResponse({ success: true, message: 'Connection successful' });
      } catch (error) {
        logger.error('Connection test failed', { error, integrationId });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return createErrorResponse(`Connection test failed: ${errorMessage}`, 400);
      }
    } else {
      // Gmail/Outlook OAuth testing would go here
      return createErrorResponse('Connection testing not yet implemented for this provider', 501);
    }
  } catch (error) {
    return handleApiError(error, 'Failed to test connection');
  }
}

