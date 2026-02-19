import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getEmailIntegrationById } from '@/lib/email-integrations';
import { fetchYahooEmails } from '@/lib/yahoo-mail';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/encryption';
import { integrationIdParamSchema } from '@/lib/validation';
import { getAuthUser } from '@/lib/auth-helpers';

// POST /api/settings/email-integrations/[id]/fetch-last-email
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await getAuthUser();
    // Validate route parameter
    const paramValidation = integrationIdParamSchema.safeParse({ id: params.id });
    if (!paramValidation.success) {
      return createErrorResponse('Invalid integration ID', 400, JSON.stringify(paramValidation.error.errors));
    }
    
    const integrationId = paramValidation.data.id;
    // Get integration
    const integration = await getEmailIntegrationById(integrationId, userId);
    
    if (!integration) {
      logger.warn('Integration not found for fetch email', { integrationId, userId });
      return createErrorResponse('Integration not found', 404);
    }
    
    logger.info('Fetching last email', { integrationId, provider: integration.provider, email: integration.email });
    
    // Decrypt password
    let password: string | null = null;
    if (integration.encrypted_password) {
      try {
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
    
    // Fetch last email based on provider
    if (integration.provider === 'yahoo') {
      const config = {
        email: integration.email,
        password: password,
        appPassword: password,
      };
      
      try {
        // Fetch emails from last 7 days, get the most recent one
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
        const emails = await fetchYahooEmails(config, since);
        
        if (emails.length === 0) {
          return createSuccessResponse({ 
            success: true, 
            message: 'No emails found in the last 7 days',
            email: null 
          });
        }
        
        // Get the most recent email (they should be sorted by date, but let's make sure)
        const lastEmail = emails.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0];
        
        logger.info('Last email fetched', { 
          integrationId, 
          subject: lastEmail.subject,
          from: lastEmail.from,
          date: lastEmail.date 
        });
        
        return createSuccessResponse({ 
          success: true, 
          email: {
            from: lastEmail.from,
            to: lastEmail.to,
            subject: lastEmail.subject,
            text: lastEmail.text,
            html: lastEmail.html,
            date: lastEmail.date,
            messageId: lastEmail.messageId,
            cleanText: lastEmail.cleanText,
          }
        });
      } catch (error) {
        logger.error('Failed to fetch email', { error, integrationId });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return createErrorResponse(`Failed to fetch email: ${errorMessage}`, 400);
      }
    } else {
      return createErrorResponse('Email fetching not yet implemented for this provider', 501);
    }
  } catch (error) {
    return handleApiError(error, 'Failed to fetch last email');
  }
}

