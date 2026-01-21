/**
 * Migration script to move data from JSON storage to Supabase
 * 
 * Usage: node scripts/migrate-to-supabase.js
 * 
 * Make sure to:
 * 1. Set up Supabase project and run schema.sql
 * 2. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 * 3. Backup your data.json file first!
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DATA_FILE = path.join(__dirname, '..', 'data', 'data.json');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('🚀 Starting migration from JSON to Supabase...\n');

  // Load JSON data
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`❌ Data file not found: ${DATA_FILE}`);
    process.exit(1);
  }

  const jsonData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log('📦 Loaded JSON data\n');

  // Migrate in order (respecting foreign key constraints)
  const tables = [
    'users',
    'tags',
    'clients',
    'conversations',
    'messages',
    'conversation_tags',
    'services',
    'appointments',
    'reminders',
    'google_calendar_sync',
    'tasks',
    'contact_files',
    'contact_custom_fields',
    'contact_notes',
  ];

  // Build a set of valid conversation IDs for foreign key validation
  const validConversationIds = new Set((jsonData.conversations || []).map(c => c.id));
  const validClientIds = new Set((jsonData.clients || []).map(c => c.id));
  const validUserId = jsonData.users && jsonData.users.length > 0 ? jsonData.users[0].id : null;

  for (const table of tables) {
    const data = jsonData[table] || [];
    if (data.length === 0) {
      console.log(`⏭️  Skipping ${table} (empty)`);
      continue;
    }

    console.log(`📤 Migrating ${table} (${data.length} records)...`);

    try {
      // Clean and prepare data
      let cleanedData = data;
      
      // Handle messages: ensure sent_at is not null and filter orphaned messages
      if (table === 'messages') {
        const originalCount = data.length;
        cleanedData = data
          .filter(msg => {
            // Filter out messages that reference non-existent conversations
            if (msg.conversation_id && !validConversationIds.has(msg.conversation_id)) {
              return false;
            }
            return true;
          })
          .map(msg => {
            // If sent_at is null, use created_at or current time
            if (!msg.sent_at) {
              msg.sent_at = msg.created_at || new Date().toISOString();
            }
            // Ensure content is JSON if it's a string
            if (typeof msg.content === 'string') {
              try {
                msg.content = JSON.parse(msg.content);
              } catch (e) {
                // If parsing fails, wrap in object
                msg.content = { text: msg.content };
              }
            }
            return msg;
          });
        
        if (cleanedData.length < originalCount) {
          console.log(`   ⚠️  Filtered out ${originalCount - cleanedData.length} orphaned messages (referencing non-existent conversations)`);
        }
      }
      
      // Filter conversation_tags to only include tags for conversations that exist
      if (table === 'conversation_tags') {
        const originalCount = data.length;
        cleanedData = data.filter(record => {
          // Only keep tags for conversations that exist
          if (record.conversation_id && !validConversationIds.has(record.conversation_id)) {
            return false;
          }
          return true;
        });
        if (cleanedData.length < originalCount) {
          console.log(`   ⚠️  Filtered out ${originalCount - cleanedData.length} orphaned conversation_tags (referencing non-existent conversations)`);
        }
      }
      
      // Filter conversations/appointments/tasks that reference non-existent clients/users
      if (table === 'conversations' || table === 'appointments' || table === 'tasks') {
        cleanedData = data.filter(record => {
          if (record.client_id && !validClientIds.has(record.client_id)) {
            return false;
          }
          if (record.user_id && validUserId && record.user_id !== validUserId) {
            return false;
          }
          return true;
        });
      }
        
        // Insert in batches of 100
        const batchSize = 100;
        for (let i = 0; i < cleanedData.length; i += batchSize) {
          const batch = cleanedData.slice(i, i + batchSize);
          
          // Junction tables (like conversation_tags) don't have ID columns - handle first
          const isJunctionTable = table === 'conversation_tags';
          
          if (isJunctionTable) {
            // For junction tables, remove any 'id' field if present (junction tables don't have IDs)
            const cleanedBatch = batch.map(row => {
              const { id, ...rest } = row;
              return rest;
            });
            
            // Try regular insert first (ON CONFLICT will handle duplicates)
            const { error: insertError } = await supabase.from(table).insert(cleanedBatch);
            
            if (insertError) {
              // If duplicate key error, that's OK - record already exists
              if (insertError.code === '23505') {
                // Silently skip duplicates for junction tables
                console.log(`   ⚠️  Some duplicates in ${table} (skipped)`);
              } else {
                console.error(`   ❌ Error inserting ${table}:`, insertError.message);
                throw insertError;
              }
            }
          } else {
            // For tables with IDs, use upsert to preserve IDs and handle duplicates
            const hasIdColumn = batch[0] && batch[0].id !== undefined;
            
            if (hasIdColumn) {
              // For tables with IDs, we need to preserve the original IDs
              // First, try to insert with explicit IDs
              const { error: insertError } = await supabase.from(table).insert(batch);
              
              if (insertError) {
                // If insert fails (duplicate key), use upsert
                if (insertError.code === '23505' || insertError.message.includes('duplicate')) {
                  const { error: upsertError } = await supabase
                    .from(table)
                    .upsert(batch, { onConflict: 'id' });
                  
                  if (upsertError) {
                    console.error(`   ❌ Error upserting ${table}:`, upsertError.message);
                    throw upsertError;
                  }
                } else {
                  console.error(`   ❌ Error inserting ${table}:`, insertError.message);
                  throw insertError;
                }
              }
            } else {
              // Regular insert for tables without IDs
              const { error } = await supabase.from(table).insert(batch);
              if (error) {
                console.error(`   ❌ Error inserting ${table}:`, error.message);
                throw error;
              }
            }
          }
        }

      console.log(`   ✅ Migrated ${data.length} records from ${table}\n`);
    } catch (error) {
      console.error(`   ❌ Failed to migrate ${table}:`, error.message);
      throw error;
    }
  }

  console.log('✅ Migration completed successfully!');
  console.log('\n📝 Next steps:');
  console.log('   1. Verify data in Supabase dashboard');
  console.log('   2. Update .env with Supabase credentials');
  console.log('   3. Test the application');
  console.log('   4. Keep data.json as backup');
}

migrate().catch((error) => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});

