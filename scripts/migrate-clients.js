require('dotenv').config();
const { getDb } = require('../lib/db');
const { findOrCreateClient, linkAppointmentToClient, linkConversationToClient, updateClientStats } = require('../lib/client-matching');

/**
 * Migration script to link existing appointments and conversations to clients
 * 
 * This script:
 * 1. Creates clients from existing appointments (by email/phone)
 * 2. Creates clients from existing conversations (by email/phone)
 * 3. Links existing appointments to clients
 * 4. Links existing conversations to clients
 * 5. Calculates and updates client statistics
 * 
 * Usage:
 *   node scripts/migrate-clients.js [--dry-run]
 */

async function migrateClients(dryRun = false) {
  const db = getDb();
  
  console.log('Starting client migration...');
  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made');
  }

  try {
    let clientsCreated = 0;
    let appointmentsLinked = 0;
    let conversationsLinked = 0;

    // Step 1: Create clients from appointments
    console.log('\nStep 1: Creating clients from appointments...');
    const appointmentsResult = await db.query(
      `SELECT DISTINCT 
        user_id,
        client_name as name,
        client_email as email,
        client_phone as phone
       FROM appointments
       WHERE (client_email IS NOT NULL OR client_phone IS NOT NULL)
       AND client_id IS NULL
       ORDER BY user_id, client_email, client_phone`
    );

    const appointmentClients = new Map();
    for (const apt of appointmentsResult.rows) {
      if (!apt.email && !apt.phone) continue;
      
      const key = `${apt.user_id}_${apt.email || ''}_${apt.phone || ''}`;
      if (!appointmentClients.has(key)) {
        appointmentClients.set(key, apt);
      }
    }

    for (const [key, apt] of appointmentClients) {
      if (!dryRun) {
        const client = await findOrCreateClient(
          apt.user_id,
          apt.name || 'Client necunoscut',
          apt.email,
          apt.phone,
          'walk-in'
        );
        console.log(`  Created/linked client: ${client.name} (ID: ${client.id})`);
        clientsCreated++;
      } else {
        console.log(`  Would create client: ${apt.name || 'Client necunoscut'} (${apt.email || apt.phone})`);
        clientsCreated++;
      }
    }

    // Step 2: Create clients from conversations
    console.log('\nStep 2: Creating clients from conversations...');
    const conversationsResult = await db.query(
      `SELECT DISTINCT 
        user_id,
        contact_name as name,
        contact_email as email,
        contact_phone as phone,
        channel
       FROM conversations
       WHERE (contact_email IS NOT NULL OR contact_phone IS NOT NULL)
       AND client_id IS NULL
       ORDER BY user_id, contact_email, contact_phone`
    );

    const conversationClients = new Map();
    for (const conv of conversationsResult.rows) {
      if (!conv.email && !conv.phone) continue;
      
      const key = `${conv.user_id}_${conv.email || ''}_${conv.phone || ''}`;
      if (!conversationClients.has(key)) {
        conversationClients.set(key, conv);
      }
    }

    for (const [key, conv] of conversationClients) {
      if (!dryRun) {
        const client = await findOrCreateClient(
          conv.user_id,
          conv.name || 'Client necunoscut',
          conv.email,
          conv.phone,
          conv.channel || 'unknown'
        );
        console.log(`  Created/linked client: ${client.name} (ID: ${client.id})`);
        clientsCreated++;
      } else {
        console.log(`  Would create client: ${conv.name || 'Client necunoscut'} (${conv.email || conv.phone})`);
        clientsCreated++;
      }
    }

    // Step 3: Link appointments to clients
    console.log('\nStep 3: Linking appointments to clients...');
    const unlinkedAppointments = await db.query(
      `SELECT a.id, a.user_id, a.client_name, a.client_email, a.client_phone
       FROM appointments a
       WHERE a.client_id IS NULL
       AND (a.client_email IS NOT NULL OR a.client_phone IS NOT NULL)`
    );

    for (const apt of unlinkedAppointments.rows) {
      if (!dryRun) {
        const client = await findOrCreateClient(
          apt.user_id,
          apt.client_name || 'Client necunoscut',
          apt.client_email,
          apt.client_phone,
          'walk-in'
        );
        await linkAppointmentToClient(apt.id, client.id);
        console.log(`  Linked appointment ${apt.id} to client ${client.id}`);
        appointmentsLinked++;
      } else {
        console.log(`  Would link appointment ${apt.id}`);
        appointmentsLinked++;
      }
    }

    // Step 4: Link conversations to clients
    console.log('\nStep 4: Linking conversations to clients...');
    const unlinkedConversations = await db.query(
      `SELECT c.id, c.user_id, c.contact_name, c.contact_email, c.contact_phone, c.channel
       FROM conversations c
       WHERE c.client_id IS NULL
       AND (c.contact_email IS NOT NULL OR c.contact_phone IS NOT NULL)`
    );

    for (const conv of unlinkedConversations.rows) {
      if (!dryRun) {
        const client = await findOrCreateClient(
          conv.user_id,
          conv.contact_name || 'Client necunoscut',
          conv.contact_email,
          conv.contact_phone,
          conv.channel || 'unknown'
        );
        await linkConversationToClient(conv.id, client.id);
        console.log(`  Linked conversation ${conv.id} to client ${client.id}`);
        conversationsLinked++;
      } else {
        console.log(`  Would link conversation ${conv.id}`);
        conversationsLinked++;
      }
    }

    // Step 5: Update all client statistics
    console.log('\nStep 5: Updating client statistics...');
    const allClients = await db.query(`SELECT id FROM clients`);
    
    for (const clientRow of allClients.rows) {
      if (!dryRun) {
        await updateClientStats(clientRow.id);
        console.log(`  Updated stats for client ${clientRow.id}`);
      } else {
        console.log(`  Would update stats for client ${clientRow.id}`);
      }
    }

    // Summary
    console.log('\n=== Migration Summary ===');
    console.log(`Clients created/linked: ${clientsCreated}`);
    console.log(`Appointments linked: ${appointmentsLinked}`);
    console.log(`Conversations linked: ${conversationsLinked}`);
    console.log(`Client stats updated: ${allClients.rows.length}`);
    
    if (dryRun) {
      console.log('\nThis was a DRY RUN. No changes were made.');
      console.log('Run without --dry-run to apply changes.');
    } else {
      console.log('\nMigration completed successfully!');
    }

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

migrateClients(dryRun);

