/**
 * Script de debug pentru Yahoo Mail - testează direct IMAP
 */

require('dotenv').config();
const Imap = require('imap');
const { simpleParser } = require('mailparser');

async function testYahooDirect() {
  const email = process.env.YAHOO_EMAIL;
  const password = process.env.YAHOO_APP_PASSWORD || process.env.YAHOO_PASSWORD;

  if (!email || !password) {
    console.error('❌ YAHOO_EMAIL or YAHOO_APP_PASSWORD not set in .env');
    return;
  }

  console.log('📡 Connecting to Yahoo IMAP...');
  console.log('   Email:', email);

  const imap = new Imap({
    user: email,
    password: password,
    host: 'imap.mail.yahoo.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });

  imap.once('ready', () => {
    console.log('✅ Connected to Yahoo IMAP');
    
    imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('❌ Error opening INBOX:', err);
        imap.end();
        return;
      }

      console.log('✅ Opened INBOX');
      console.log('   Total messages:', box.messages.total);
      console.log('   Unread messages:', box.messages.new);

      // Search for all emails from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      console.log('\n📥 Searching for emails since:', today.toISOString());
      
      imap.search([['SINCE', today]], (err, results) => {
        if (err) {
          console.error('❌ Search error:', err);
          imap.end();
          return;
        }

        if (!results || results.length === 0) {
          console.log('⚠️  No emails found since today');
          console.log('   Trying to find any unread emails...');
          
          imap.search(['UNSEEN'], (err, unreadResults) => {
            if (err) {
              console.error('❌ Unread search error:', err);
              imap.end();
              return;
            }
            
            console.log('   Found', unreadResults?.length || 0, 'unread emails');
            imap.end();
          });
          return;
        }

        console.log(`✅ Found ${results.length} emails since today`);
        
        // Fetch first 3 emails as sample
        const sampleResults = results.slice(0, 3);
        const fetch = imap.fetch(sampleResults, { bodies: '', struct: true });

        let emailCount = 0;
        fetch.on('message', (msg, seqno) => {
          emailCount++;
          console.log(`\n📧 Email ${emailCount}:`);
          
          msg.on('body', (stream, info) => {
            simpleParser(stream, (err, parsed) => {
              if (err) {
                console.error('   ❌ Parse error:', err.message);
                return;
              }

              if (parsed) {
                let from = 'Unknown';
                if (parsed.from) {
                  if (typeof parsed.from === 'string') {
                    from = parsed.from;
                  } else if (parsed.from.text) {
                    from = parsed.from.text;
                  } else if (Array.isArray(parsed.from.value) && parsed.from.value.length > 0) {
                    from = parsed.from.value[0].address || 'Unknown';
                  }
                }
                
                console.log('   From:', from);
                console.log('   Subject:', parsed.subject || 'No subject');
                console.log('   Date:', parsed.date || 'No date');
                console.log('   Text length:', parsed.text ? parsed.text.length : 0);
              }
            });
          });

          msg.once('attributes', (attrs) => {
            console.log('   UID:', attrs.uid);
          });
        });

        fetch.once('end', () => {
          console.log('\n✅ Sample fetch complete');
          imap.end();
        });

        fetch.once('error', (err) => {
          console.error('❌ Fetch error:', err);
          imap.end();
        });
      });
    });
  });

  imap.once('error', (err) => {
    console.error('❌ IMAP connection error:', err.message);
  });

  imap.connect();
}

testYahooDirect();

