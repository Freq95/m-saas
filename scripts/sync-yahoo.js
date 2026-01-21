/**
 * Script pentru sincronizare automată Yahoo Mail
 * Rulează periodic pentru a aduce emailurile noi în sistem
 */

require('dotenv').config();
const fetch = require('node-fetch');

async function syncYahoo() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    
    // Sync only today's emails by default
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const response = await fetch(`${baseUrl}/api/yahoo/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: 1,
        todayOnly: true // Sync only today's emails
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Yahoo sync successful: ${result.synced} new emails synced (${result.total} total)`);
    } else {
      console.error('❌ Yahoo sync failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error syncing Yahoo:', error.message);
    console.log('💡 Make sure the server is running: npm run dev');
  }
}

// Rulează sync-ul
syncYahoo();

