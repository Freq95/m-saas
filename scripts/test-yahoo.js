/**
 * Script de test rapid pentru Yahoo Mail integration
 */

require('dotenv').config();
const fetch = require('node-fetch');

async function testYahoo() {
  console.log('🧪 Testing Yahoo Mail Integration...\n');

  // Check if credentials are set
  if (!process.env.YAHOO_EMAIL) {
    console.error('❌ YAHOO_EMAIL not set in .env');
    return;
  }

  if (!process.env.YAHOO_APP_PASSWORD && !process.env.YAHOO_PASSWORD) {
    console.error('❌ YAHOO_APP_PASSWORD or YAHOO_PASSWORD not set in .env');
    return;
  }

  console.log('✅ Credentials found in .env');
  console.log(`   Email: ${process.env.YAHOO_EMAIL}`);
  console.log(`   Using: ${process.env.YAHOO_APP_PASSWORD ? 'App Password' : 'Normal Password'}\n`);

  // Test connection
  console.log('📡 Testing connection...');
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/yahoo/sync`);
    const result = await response.json();

    if (result.connected) {
      console.log('✅ Connection successful!\n');
      
      // Test sync (only today's emails)
      console.log('📥 Syncing emails (today only)...');
      const syncResponse = await fetch(`${baseUrl}/api/yahoo/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: 1,
          todayOnly: true // Sync only today's emails
        }),
      });
      
      const syncResult = await syncResponse.json();
      
      if (syncResult.success) {
        console.log(`✅ Sync successful!`);
        console.log(`   Synced: ${syncResult.synced} new emails`);
        console.log(`   Total: ${syncResult.total} emails found`);
        console.log('\n🎉 Yahoo Mail integration is working!');
        console.log('   Check http://localhost:3000/inbox to see your emails');
      } else {
        console.error('❌ Sync failed:', syncResult.error);
      }
    } else {
      console.error('❌ Connection failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Make sure the server is running: npm run dev');
  }
}

testYahoo();

