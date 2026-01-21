require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Load existing data
const dataDir = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'data.json');

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

const userId = 1;

// Ensure user exists
if (data.users.length === 0) {
  data.users.push({
    id: userId,
    email: 'test@example.com',
    password_hash: '$2a$10$dummyhash',
    name: 'Test User',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// Ensure services exist
if (data.services.length === 0) {
  data.services = [
    { id: 1, user_id: userId, name: 'Tuns + Spălat', duration_minutes: 45, price: 80, description: 'Tuns și spălat profesional', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 2, user_id: userId, name: 'Vopsit', duration_minutes: 120, price: 200, description: 'Vopsire completă', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 3, user_id: userId, name: 'Manichiură', duration_minutes: 60, price: 100, description: 'Manichiură completă', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 4, user_id: userId, name: 'Pedicură', duration_minutes: 60, price: 90, description: 'Pedicură completă', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 5, user_id: userId, name: 'Tratament facial', duration_minutes: 90, price: 150, description: 'Tratament facial complet', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ];
}

// Mock email conversations
const emailNames = [
  'Maria Popescu', 'Ion Georgescu', 'Ana Ionescu', 'Mihai Radu', 'Elena Dumitru',
  'Alexandru Stan', 'Cristina Marin', 'Florin Popa', 'Andreea Munteanu', 'Bogdan Vasile'
];

const emailSubjects = [
  'Întrebare despre programare',
  'Vreau să rezerv o programare',
  'Cât costă serviciul?',
  'Aveți loc mâine?',
  'Reprogramare programare',
  'Anulare programare',
  'Întrebare prețuri',
  'Disponibilitate săptămâna viitoare',
  'Confirmare programare',
  'Mulțumesc pentru servicii'
];

const emailMessages = [
  'Bună! Aș dori să fac o programare pentru manichiură. Aveți loc mâine?',
  'Salut! Cât costă un tuns + spălat?',
  'Bună ziua! Vreau să rezerv pentru vineri seara.',
  'Aveți disponibilitate pentru săptămâna viitoare?',
  'Aș vrea să reprogramez programarea de mâine.',
  'Trebuie să anulez programarea de joi.',
  'Care sunt prețurile pentru serviciile voastre?',
  'Bună! Când aveți cel mai apropiat loc liber?',
  'Mulțumesc! Programarea a fost perfectă.',
  'Vreau să rezerv pentru două persoane.'
];

let conversationId = data.conversations.length > 0 
  ? Math.max(...data.conversations.map(c => c.id)) + 1 
  : 1;

let messageId = data.messages.length > 0
  ? Math.max(...data.messages.map(m => m.id)) + 1
  : 1;

// Get tags for later use
const leadTag = data.tags.find(t => t.name === 'Lead nou');
const priceTag = data.tags.find(t => t.name === 'Întrebare preț');
const rescheduleTag = data.tags.find(t => t.name === 'Reprogramare');
const cancelTag = data.tags.find(t => t.name === 'Anulare');

// Create 10 email conversations
for (let i = 0; i < 10; i++) {
  const email = `client${i + 1}@example.com`;
  const name = emailNames[i];
  const subject = emailSubjects[i];
  const message = emailMessages[i];
  
  // Create conversation
  const conv = {
    id: conversationId++,
    user_id: userId,
    channel: 'email',
    channel_id: `email_${i + 1}`,
    contact_name: name,
    contact_email: email,
    contact_phone: `07${Math.floor(Math.random() * 100000000)}`,
    subject: subject,
    status: i < 3 ? 'open' : (i < 7 ? 'closed' : 'archived'),
    created_at: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
    updated_at: new Date(Date.now() - (i * 12 * 60 * 60 * 1000)).toISOString(),
  };
  
  data.conversations.push(conv);
  
  // Add inbound message
  data.messages.push({
    id: messageId++,
    conversation_id: conv.id,
    direction: 'inbound',
    content: message,
    sent_at: conv.created_at,
    created_at: conv.created_at,
  });
  
  // Add outbound response for some
  if (i < 5) {
    data.messages.push({
      id: messageId++,
      conversation_id: conv.id,
      direction: 'outbound',
      content: i === 0 
        ? 'Bună! Da, avem loc mâine. Ce oră vă convine?'
        : i === 1
        ? 'Bună ziua! Tuns + spălat costă 80 lei și durează 45 minute.'
        : 'Mulțumim pentru mesaj! Vă contactăm în curând.',
      sent_at: new Date(new Date(conv.created_at).getTime() + 30 * 60 * 1000).toISOString(),
      created_at: new Date(new Date(conv.created_at).getTime() + 30 * 60 * 1000).toISOString(),
    });
  }
  
  // Add tags
  if (i < 3 && leadTag) {
    data.conversation_tags.push({ conversation_id: conv.id, tag_id: leadTag.id });
  } else if (i === 1 || i === 6) {
    if (priceTag) data.conversation_tags.push({ conversation_id: conv.id, tag_id: priceTag.id });
  } else if (i === 4) {
    if (rescheduleTag) data.conversation_tags.push({ conversation_id: conv.id, tag_id: rescheduleTag.id });
  } else if (i === 5) {
    if (cancelTag) data.conversation_tags.push({ conversation_id: conv.id, tag_id: cancelTag.id });
  }
}

// Create 10 Facebook conversations
const facebookNames = [
  'Laura Constantin', 'Radu Petrescu', 'Ioana Gheorghe', 'Marius Enache', 'Diana Stoica',
  'Cătălin Nistor', 'Raluca Tudor', 'Adrian Mocanu', 'Simona Barbu', 'Vladimir Lupu'
];

const facebookMessages = [
  'Bună! Când aveți cel mai apropiat loc?',
  'Salut! Cât costă o manichiură?',
  'Bună seara! Vreau să rezerv pentru mâine.',
  'Aveți disponibilitate pentru vineri?',
  'Mulțumesc pentru serviciile excelente!',
  'Bună! Aș dori să reprogramez.',
  'Care sunt orele de program?',
  'Vreau să rezerv pentru două persoane.',
  'Aveți oferte speciale?',
  'Bună! Cât durează un tratament facial?'
];

for (let i = 0; i < 10; i++) {
  const senderId = `fb_${1000000 + i}`;
  const name = facebookNames[i];
  const message = facebookMessages[i];
  
  const conv = {
    id: conversationId++,
    user_id: userId,
    channel: 'facebook',
    channel_id: senderId,
    contact_name: name,
    contact_email: null,
    contact_phone: null,
    subject: null,
    status: i < 4 ? 'open' : 'closed',
    created_at: new Date(Date.now() - (i * 18 * 60 * 60 * 1000)).toISOString(),
    updated_at: new Date(Date.now() - (i * 9 * 60 * 60 * 1000)).toISOString(),
  };
  
  data.conversations.push(conv);
  
  data.messages.push({
    id: messageId++,
    conversation_id: conv.id,
    direction: 'inbound',
    content: message,
    sent_at: conv.created_at,
    created_at: conv.created_at,
  });
  
  // Add response for some
  if (i < 6) {
    data.messages.push({
      id: messageId++,
      conversation_id: conv.id,
      direction: 'outbound',
      content: 'Mulțumim pentru mesaj! Vă contactăm în curând.',
      sent_at: new Date(new Date(conv.created_at).getTime() + 20 * 60 * 1000).toISOString(),
      created_at: new Date(new Date(conv.created_at).getTime() + 20 * 60 * 1000).toISOString(),
    });
  }
  
  // Add tags
  if (i < 2 && leadTag) {
    data.conversation_tags.push({ conversation_id: conv.id, tag_id: leadTag.id });
  } else if (i === 1 || i === 5) {
    if (priceTag) data.conversation_tags.push({ conversation_id: conv.id, tag_id: priceTag.id });
  }
}

// Create 10 form submissions
const formNames = [
  'Georgiana Pop', 'Nicolae Ciobanu', 'Monica Dragomir', 'Sergiu Moldovan', 'Carmen Badea',
  'Liviu Toma', 'Roxana Neagu', 'Ciprian Bălan', 'Gabriela Șerban', 'Dan Costache'
];

for (let i = 0; i < 10; i++) {
  const name = formNames[i];
  const email = `form${i + 1}@example.com`;
  const phone = `07${Math.floor(Math.random() * 100000000)}`;
  const message = `Bună! Aș dori informații despre serviciile voastre. ${i % 2 === 0 ? 'Aveți loc mâine?' : 'Care sunt prețurile?'}`;
  
  const conv = {
    id: conversationId++,
    user_id: userId,
    channel: 'form',
    channel_id: `form_${i + 1}`,
    contact_name: name,
    contact_email: email,
    contact_phone: phone,
    subject: 'Formular site',
    status: 'open',
    created_at: new Date(Date.now() - (i * 6 * 60 * 60 * 1000)).toISOString(),
    updated_at: new Date(Date.now() - (i * 3 * 60 * 60 * 1000)).toISOString(),
  };
  
  data.conversations.push(conv);
  
  data.messages.push({
    id: messageId++,
    conversation_id: conv.id,
    direction: 'inbound',
    content: message,
    sent_at: conv.created_at,
    created_at: conv.created_at,
  });
  
  // All forms get "Lead nou" tag
  if (leadTag) {
    data.conversation_tags.push({ conversation_id: conv.id, tag_id: leadTag.id });
  }
}

// Create appointments for the next 2 weeks
let appointmentId = data.appointments.length > 0
  ? Math.max(...data.appointments.map(a => a.id)) + 1
  : 1;

const appointmentClients = [
  'Maria Popescu', 'Ion Georgescu', 'Ana Ionescu', 'Mihai Radu', 'Elena Dumitru',
  'Alexandru Stan', 'Cristina Marin', 'Florin Popa', 'Andreea Munteanu', 'Bogdan Vasile',
  'Laura Constantin', 'Radu Petrescu', 'Ioana Gheorghe', 'Marius Enache', 'Diana Stoica'
];

const appointmentEmails = appointmentClients.map((name, i) => 
  `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`
);

const appointmentPhones = appointmentClients.map(() => 
  `07${Math.floor(Math.random() * 100000000)}`
);

// Create appointments for next 14 days
const today = new Date();
today.setHours(0, 0, 0, 0);

for (let day = 0; day < 14; day++) {
  const date = new Date(today);
  date.setDate(date.getDate() + day);
  
  // Skip weekends for some variety
  if (date.getDay() === 0 || date.getDay() === 6) continue;
  
  // Create 1-3 appointments per day
  const appointmentsPerDay = Math.floor(Math.random() * 3) + 1;
  const hours = [9, 10, 11, 14, 15, 16, 17];
  
  for (let apt = 0; apt < appointmentsPerDay && apt < hours.length; apt++) {
    const hour = hours[apt];
    const serviceIndex = Math.floor(Math.random() * data.services.length);
    const service = data.services[serviceIndex];
    const clientIndex = (day * 3 + apt) % appointmentClients.length;
    
    const startTime = new Date(date);
    startTime.setHours(hour, Math.random() < 0.5 ? 0 : 30, 0, 0);
    
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + service.duration_minutes);
    
    const statuses = ['scheduled', 'scheduled', 'scheduled', 'completed', 'cancelled', 'no_show'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    // Link to conversation if exists
    const relatedConv = data.conversations.find(c => 
      c.contact_name === appointmentClients[clientIndex] || 
      c.contact_email === appointmentEmails[clientIndex]
    );
    
    data.appointments.push({
      id: appointmentId++,
      user_id: userId,
      conversation_id: relatedConv?.id || null,
      service_id: service.id,
      client_name: appointmentClients[clientIndex],
      client_email: appointmentEmails[clientIndex],
      client_phone: appointmentPhones[clientIndex],
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      status: status,
      notes: status === 'completed' ? 'Serviciu finalizat cu succes' : null,
      reminder_sent: day < 2 ? true : false, // Reminders sent for appointments in next 2 days
      created_at: new Date(Date.now() - (14 - day) * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - (14 - day) * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
}

// Save data
fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');

console.log('✅ Mock data created successfully!');
console.log(`📧 Email conversations: 10`);
console.log(`📱 Facebook conversations: 10`);
console.log(`📝 Form submissions: 10`);
console.log(`📅 Appointments: ${data.appointments.length}`);
console.log(`💬 Total messages: ${data.messages.length}`);
console.log(`\n🎉 Application is now populated with realistic data!`);

