const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data/data.json', 'utf-8'));

const allConvs = data.conversations || [];
const emailConvs = allConvs.filter(c => c.channel === 'email');

console.log('Total conversations:', allConvs.length);
console.log('Email conversations:', emailConvs.length);

if (emailConvs.length > 0) {
  console.log('\nEmail conversations found:');
  emailConvs.slice(0, 5).forEach(c => {
    console.log(`  ID: ${c.id}, From: ${c.contact_email}, Subject: ${c.subject}`);
  });
  console.log('\n❌ Email conversations still exist!');
} else {
  console.log('\n✅ No email conversations in storage');
  console.log('\nIf you see emails in inbox, they might be:');
  console.log('  1. From a recent sync (run after deletion)');
  console.log('  2. Cached in browser (try hard refresh: Ctrl+Shift+R)');
  console.log('  3. Mock data that needs to be cleared');
}

