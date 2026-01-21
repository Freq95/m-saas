import { NextRequest, NextResponse } from 'next/server';
import { getYahooConfig, sendYahooEmail } from '@/lib/yahoo-mail';

// POST /api/yahoo/send - Send email via Yahoo
export async function POST(request: NextRequest) {
  try {
    const config = getYahooConfig();
    
    if (!config) {
      return NextResponse.json(
        { error: 'Yahoo Mail not configured. Set YAHOO_EMAIL and YAHOO_PASSWORD (or YAHOO_APP_PASSWORD) in .env' },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    // Validate input
    const { yahooSendSchema } = await import('@/lib/validation');
    const validationResult = yahooSendSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { to, subject, text, html } = validationResult.data;

    // Send email via Yahoo SMTP
    await sendYahooEmail(config, to, subject, text, html);

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
    });
  } catch (error: any) {
    console.error('Error sending Yahoo email:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to send email',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

