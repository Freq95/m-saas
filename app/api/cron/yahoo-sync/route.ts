import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron job endpoint for automatic Yahoo email sync
 * Runs every 5 minutes
 * 
 * For Vercel: Configure in vercel.json with cron schedule (every 5 minutes)
 * For local dev: Use the sync-yahoo-cron.js script with node-cron
 */
export async function GET(request: NextRequest) {
  // Verify cron secret for security (optional but recommended)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Determine base URL
    let baseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!baseUrl) {
      if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      } else {
        baseUrl = 'http://localhost:3000';
      }
    }
    
    // Call the Yahoo sync endpoint with todayOnly=true
    const syncResponse = await fetch(`${baseUrl}/api/yahoo/sync`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        userId: 1,
        todayOnly: true, // Only sync today's emails
      }),
    });

    const result = await syncResponse.json();
    
    if (result.success) {
      console.log(`✅ Yahoo sync cron: ${result.synced} new emails synced (${result.total} total)`);
      return NextResponse.json({
        success: true,
        synced: result.synced,
        total: result.total,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error('❌ Yahoo sync cron failed:', result.error);
      return NextResponse.json(
        { 
          success: false,
          error: result.error,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('❌ Error in Yahoo sync cron:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to sync Yahoo emails',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

