/**
 * Test Supabase connection
 * 
 * Usage: node scripts/test-supabase-connection.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 Testing Supabase connection...\n');

if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL is not set in .env');
  console.log('\n💡 Add this to your .env file:');
  console.log('   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in .env');
  console.log('\n💡 Add this to your .env file:');
  console.log('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  console.log('   (or NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    console.log('📡 Connecting to Supabase...');
    console.log(`   URL: ${supabaseUrl}\n`);

    // Test 1: Check if we can connect
    console.log('1️⃣ Testing basic connection...');
    const { data: healthData, error: healthError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (healthError && healthError.code !== 'PGRST116') {
      // PGRST116 means table doesn't exist, which is OK if schema not run yet
      throw healthError;
    }
    console.log('   ✅ Connection successful!\n');

    // Test 2: Check if schema is set up
    console.log('2️⃣ Checking database schema...');
    const tables = [
      'users',
      'conversations',
      'messages',
      'clients',
      'appointments',
      'services',
    ];

    let tablesExist = 0;
    for (const table of tables) {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (!error || error.code === 'PGRST116') {
        if (error?.code === 'PGRST116') {
          console.log(`   ⚠️  Table '${table}' does not exist`);
        } else {
          console.log(`   ✅ Table '${table}' exists`);
          tablesExist++;
        }
      } else {
        console.log(`   ❌ Error checking '${table}': ${error.message}`);
      }
    }

    console.log(`\n   📊 ${tablesExist}/${tables.length} tables found`);

    if (tablesExist === 0) {
      console.log('\n⚠️  No tables found. Make sure you ran the schema.sql file in Supabase SQL Editor.');
      console.log('   See SUPABASE_SETUP.md for instructions.');
    } else if (tablesExist < tables.length) {
      console.log('\n⚠️  Some tables are missing. Please run the complete schema.sql file.');
    } else {
      console.log('\n✅ All tables exist! Schema is set up correctly.');
    }

    // Test 3: Check data
    console.log('\n3️⃣ Checking existing data...');
    const { count: userCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .then(r => ({ count: r.count || 0 }))
      .catch(() => ({ count: 0 }));

    const { count: convCount } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .then(r => ({ count: r.count || 0 }))
      .catch(() => ({ count: 0 }));

    const { count: msgCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .then(r => ({ count: r.count || 0 }))
      .catch(() => ({ count: 0 }));

    console.log(`   Users: ${userCount || 0}`);
    console.log(`   Conversations: ${convCount || 0}`);
    console.log(`   Messages: ${msgCount || 0}`);

    if (userCount === 0 && convCount === 0) {
      console.log('\n💡 No data found. Run the migration script to import your data:');
      console.log('   node scripts/migrate-to-supabase.js');
    }

    console.log('\n✅ Supabase connection test completed!');
    console.log('\n📝 Next steps:');
    if (tablesExist < tables.length) {
      console.log('   1. Run schema.sql in Supabase SQL Editor');
    }
    if (userCount === 0) {
      console.log('   2. Run migration: node scripts/migrate-to-supabase.js');
    }
    console.log('   3. Start your app: npm run dev');

  } catch (error) {
    console.error('\n❌ Connection test failed:');
    console.error(`   ${error.message}`);
    
    if (error.message.includes('Invalid API key')) {
      console.log('\n💡 Check your API keys in .env file');
    } else if (error.message.includes('Failed to fetch')) {
      console.log('\n💡 Check your NEXT_PUBLIC_SUPABASE_URL');
    } else {
      console.log('\n💡 See SUPABASE_SETUP.md for troubleshooting');
    }
    
    process.exit(1);
  }
}

testConnection();

