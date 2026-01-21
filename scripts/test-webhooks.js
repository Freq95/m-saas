require('dotenv').config();
const http = require('http');

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Mock data for email webhooks
const emailMockData = [
  { from: 'maria.popescu@example.com', to: 'salon@example.com', subject: 'Întrebare despre programare', text: 'Bună! Aș dori să fac o programare pentru manichiură. Aveți loc mâine?' },
  { from: 'ion.georgescu@example.com', to: 'salon@example.com', subject: 'Cât costă serviciul?', text: 'Salut! Cât costă un tuns + spălat?' },
  { from: 'ana.ionescu@example.com', to: 'salon@example.com', subject: 'Vreau să rezerv o programare', text: 'Bună ziua! Vreau să rezerv pentru vineri seara.' },
  { from: 'mihai.radu@example.com', to: 'salon@example.com', subject: 'Aveți loc mâine?', text: 'Aveți disponibilitate pentru săptămâna viitoare?' },
  { from: 'elena.dumitru@example.com', to: 'salon@example.com', subject: 'Reprogramare programare', text: 'Aș vrea să reprogramez programarea de mâine.' },
  { from: 'alexandru.stan@example.com', to: 'salon@example.com', subject: 'Anulare programare', text: 'Trebuie să anulez programarea de joi.' },
  { from: 'cristina.marin@example.com', to: 'salon@example.com', subject: 'Întrebare prețuri', text: 'Care sunt prețurile pentru serviciile voastre?' },
  { from: 'florin.popa@example.com', to: 'salon@example.com', subject: 'Disponibilitate săptămâna viitoare', text: 'Bună! Când aveți cel mai apropiat loc liber?' },
  { from: 'andreea.munteanu@example.com', to: 'salon@example.com', subject: 'Confirmare programare', text: 'Mulțumesc! Programarea a fost perfectă.' },
  { from: 'bogdan.vasile@example.com', to: 'salon@example.com', subject: 'Rezervare pentru două persoane', text: 'Vreau să rezerv pentru două persoane.' },
];

// Mock data for Facebook webhooks
const facebookMockData = [
  { senderId: 'fb_1000001', senderName: 'Laura Constantin', message: 'Bună! Când aveți cel mai apropiat loc?' },
  { senderId: 'fb_1000002', senderName: 'Radu Petrescu', message: 'Salut! Cât costă o manichiură?' },
  { senderId: 'fb_1000003', senderName: 'Ioana Gheorghe', message: 'Bună seara! Vreau să rezerv pentru mâine.' },
  { senderId: 'fb_1000004', senderName: 'Marius Enache', message: 'Aveți disponibilitate pentru vineri?' },
  { senderId: 'fb_1000005', senderName: 'Diana Stoica', message: 'Mulțumesc pentru serviciile excelente!' },
  { senderId: 'fb_1000006', senderName: 'Cătălin Nistor', message: 'Bună! Aș dori să reprogramez.' },
  { senderId: 'fb_1000007', senderName: 'Raluca Tudor', message: 'Care sunt orele de program?' },
  { senderId: 'fb_1000008', senderName: 'Adrian Mocanu', message: 'Vreau să rezerv pentru două persoane.' },
  { senderId: 'fb_1000009', senderName: 'Simona Barbu', message: 'Aveți oferte speciale?' },
  { senderId: 'fb_1000010', senderName: 'Vladimir Lupu', message: 'Bună! Cât durează un tratament facial?' },
];

// Mock data for form webhooks
const formMockData = [
  { name: 'Georgiana Pop', email: 'georgiana.pop@example.com', phone: '0712345678', message: 'Bună! Aș dori informații despre serviciile voastre. Aveți loc mâine?' },
  { name: 'Nicolae Ciobanu', email: 'nicolae.ciobanu@example.com', phone: '0723456789', message: 'Care sunt prețurile pentru manichiură?' },
  { name: 'Monica Dragomir', email: 'monica.dragomir@example.com', phone: '0734567890', message: 'Vreau să rezerv o programare pentru săptămâna viitoare.' },
  { name: 'Sergiu Moldovan', email: 'sergiu.moldovan@example.com', phone: '0745678901', message: 'Aveți disponibilitate pentru vineri seara?' },
  { name: 'Carmen Badea', email: 'carmen.badea@example.com', phone: '0756789012', message: 'Bună! Cât costă un tratament facial?' },
  { name: 'Liviu Toma', email: 'liviu.toma@example.com', phone: '0767890123', message: 'Vreau să rezerv pentru două persoane.' },
  { name: 'Roxana Neagu', email: 'roxana.neagu@example.com', phone: '0778901234', message: 'Aveți oferte pentru pachete?' },
  { name: 'Ciprian Bălan', email: 'ciprian.balan@example.com', phone: '0789012345', message: 'Bună ziua! Când aveți cel mai apropiat loc?' },
  { name: 'Gabriela Șerban', email: 'gabriela.serban@example.com', phone: '0790123456', message: 'Mulțumesc pentru serviciile excelente!' },
  { name: 'Dan Costache', email: 'dan.costache@example.com', phone: '0701234567', message: 'Vreau să rezerv pentru mâine dimineața.' },
];

function makeRequest(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function testWebhooks() {
  console.log('🚀 Testing webhooks with mock data...\n');

  // Test email webhooks
  console.log('📧 Testing Email Webhooks (10 requests)...');
  for (let i = 0; i < 10; i++) {
    try {
      const result = await makeRequest(`${BASE_URL}/api/webhooks/email`, {
        userId: 1,
        ...emailMockData[i],
      });
      console.log(`  ✅ Email ${i + 1}: ${result.status === 200 ? 'Success' : 'Failed'} - ${emailMockData[i].subject}`);
    } catch (error) {
      console.log(`  ❌ Email ${i + 1}: Error - ${error.message}`);
    }
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n📱 Testing Facebook Webhooks (10 requests)...');
  for (let i = 0; i < 10; i++) {
    try {
      const result = await makeRequest(`${BASE_URL}/api/webhooks/facebook`, {
        userId: 1,
        ...facebookMockData[i],
      });
      console.log(`  ✅ Facebook ${i + 1}: ${result.status === 200 ? 'Success' : 'Failed'} - ${facebookMockData[i].senderName}`);
    } catch (error) {
      console.log(`  ❌ Facebook ${i + 1}: Error - ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n📝 Testing Form Webhooks (10 requests)...');
  for (let i = 0; i < 10; i++) {
    try {
      const result = await makeRequest(`${BASE_URL}/api/webhooks/form`, {
        userId: 1,
        ...formMockData[i],
      });
      console.log(`  ✅ Form ${i + 1}: ${result.status === 200 ? 'Success' : 'Failed'} - ${formMockData[i].name}`);
    } catch (error) {
      console.log(`  ❌ Form ${i + 1}: Error - ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n✅ All webhook tests completed!');
  console.log('💡 Check your inbox at http://localhost:3000/inbox to see the conversations');
}

// Check if server is running
makeRequest(`${BASE_URL}/api/dashboard?userId=1`, {})
  .then(() => {
    testWebhooks();
  })
  .catch((error) => {
    console.error('❌ Server is not running or not accessible at', BASE_URL);
    console.error('   Please start the server with: npm run dev');
    console.error('   Error:', error.message);
    process.exit(1);
  });

