require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function seed() {
  const dataDir = path.join(process.cwd(), 'data');
  const dataFile = path.join(dataDir, 'data.json');

  try {
    // Load existing data
    let data = {
      users: [],
      conversations: [],
      messages: [],
      tags: [],
      conversation_tags: [],
      services: [],
      appointments: [],
      reminders: [],
      google_calendar_sync: [],
    };

    if (fs.existsSync(dataFile)) {
      const fileData = fs.readFileSync(dataFile, 'utf-8');
      data = JSON.parse(fileData);
    }

    // Create test user
    let userId = 1;
    const existingUser = data.users.find((u: any) => u.email === 'test@example.com');
    if (!existingUser) {
      data.users.push({
        id: userId,
        email: 'test@example.com',
        password_hash: '$2a$10$dummyhash',
        name: 'Test User',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      userId = existingUser.id;
    }

    // Create sample services
    const existingServices = data.services.filter((s: any) => s.user_id === userId);
    if (existingServices.length === 0) {
      const services = [
        { id: 1, user_id: userId, name: 'Tuns + Spălat', duration_minutes: 45, price: 80, description: 'Tuns și spălat profesional', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 2, user_id: userId, name: 'Vopsit', duration_minutes: 120, price: 200, description: 'Vopsire completă', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 3, user_id: userId, name: 'Manichiură', duration_minutes: 60, price: 100, description: 'Manichiură completă', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 4, user_id: userId, name: 'Pedicură', duration_minutes: 60, price: 90, description: 'Pedicură completă', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ];
      data.services.push(...services);
    }

    // Create sample conversation
    const existingConv = data.conversations.find((c: any) => c.contact_email === 'maria@example.com');
    let conversationId;
    
    if (!existingConv) {
      conversationId = (data.conversations.length > 0 
        ? Math.max(...data.conversations.map((c: any) => c.id)) + 1 
        : 1);
      
      data.conversations.push({
        id: conversationId,
        user_id: userId,
        channel: 'email',
        contact_name: 'Maria Popescu',
        contact_email: 'maria@example.com',
        subject: 'Întrebare despre programare',
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add sample messages
      data.messages.push(
        {
          id: 1,
          conversation_id: conversationId,
          direction: 'inbound',
          content: 'Bună! Aș dori să fac o programare pentru manichiură. Aveți loc mâine?',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          conversation_id: conversationId,
          direction: 'outbound',
          content: 'Bună! Da, avem loc mâine. Ce oră vă convine?',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }
      );

      // Add tag
      const leadTag = data.tags.find((t: any) => t.name === 'Lead nou');
      if (leadTag) {
        data.conversation_tags.push({
          conversation_id: conversationId,
          tag_id: leadTag.id,
        });
      }
    } else {
      conversationId = existingConv.id;
    }

    // Save data
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');

    console.log('Seed completed successfully');
    console.log(`Test user ID: ${userId}`);
    console.log(`Sample conversation ID: ${conversationId}`);
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seed();

