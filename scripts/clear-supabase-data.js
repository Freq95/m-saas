/**
 * Clear all data from Supabase tables (for fresh migration)
 * 
 * Usage: node scripts/clear-supabase-data.js
 * 
 * WARNING: This will delete ALL data from Supabase!
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearData() {
  console.log('⚠️  WARNING: This will delete ALL data from Supabase!\n');
  
  // Tables in reverse order of dependencies
  const tables = [
    'contact_notes',
    'contact_custom_fields',
    'contact_files',
    'tasks',
    'google_calendar_sync',
    'reminders',
    'appointments',
    'services',
    'conversation_tags',
    'messages',
    'conversations',
    'clients',
    'tags',
    'users',
  ];

  for (const table of tables) {
    try {
      console.log(`🗑️  Clearing ${table}...`);
      const { error } = await supabase.from(table).delete().neq('id', 0); // Delete all
      if (error) {
        console.error(`   ❌ Error clearing ${table}:`, error.message);
      } else {
        console.log(`   ✅ Cleared ${table}`);
      }
    } catch (error) {
      console.error(`   ❌ Error clearing ${table}:`, error.message);
    }
  }

  console.log('\n✅ All tables cleared! You can now run the migration.');
}

clearData().catch((error) => {
  console.error('\n❌ Failed to clear data:', error);
  process.exit(1);
});

