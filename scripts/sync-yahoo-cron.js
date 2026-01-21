/**
 * Local development cron script for Yahoo email sync
 * Runs every 5 minutes
 * 
 * Usage: node scripts/sync-yahoo-cron.js
 * 
 * Make sure the Next.js server is running (npm run dev)
 */

require('dotenv').config();
const cron = require('node-cron');
const fetch = require('node-fetch');

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

async function syncYahoo() {
  try {
    const url = `${BASE_URL}/api/cron/yahoo-sync`;
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add auth header if CRON_SECRET is set
    if (CRON_SECRET) {
      headers['Authorization'] = `Bearer ${CRON_SECRET}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    // Check if response is ok before parsing JSON
    if (!response.ok) {
      const text = await response.text();
      console.error(`[${new Date().toISOString()}] ❌ Yahoo sync failed: HTTP ${response.status} - ${text.substring(0, 100)}`);
      return;
    }

    const result = await response.json();
    
    if (result.success) {
      console.log(`[${new Date().toISOString()}] ✅ Yahoo sync: ${result.synced} new emails (${result.total} total)`);
    } else {
      console.error(`[${new Date().toISOString()}] ❌ Yahoo sync failed:`, result.error);
    }
  } catch (error) {
    // Silently skip connection errors - server might not be ready yet
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      // Don't spam errors if server isn't ready
      return;
    }
    console.error(`[${new Date().toISOString()}] ❌ Error syncing Yahoo:`, error.message);
  }
}

// Run immediately on start
console.log('🚀 Starting Yahoo sync cron job (every 5 minutes)...');
console.log(`📍 Target URL: ${BASE_URL}/api/cron/yahoo-sync`);
syncYahoo();

// Schedule to run every 5 minutes
cron.schedule('*/5 * * * *', () => {
  syncYahoo();
});

console.log('⏰ Cron job scheduled: Every 5 minutes');
console.log('Press Ctrl+C to stop');

