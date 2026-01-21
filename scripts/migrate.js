require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Initialize JSON storage - just ensure data directory exists and has default tags
async function migrate() {
  const dataDir = path.join(process.cwd(), 'data');
  
  try {
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dataFile = path.join(dataDir, 'data.json');
    
    // Initialize with default structure if file doesn't exist
    if (!fs.existsSync(dataFile)) {
      const defaultData = {
        users: [],
        conversations: [],
        messages: [],
        tags: [
          { id: 1, name: 'Lead nou', color: '#10B981', created_at: new Date().toISOString() },
          { id: 2, name: 'Întrebare preț', color: '#F59E0B', created_at: new Date().toISOString() },
          { id: 3, name: 'Reprogramare', color: '#3B82F6', created_at: new Date().toISOString() },
          { id: 4, name: 'Anulare', color: '#EF4444', created_at: new Date().toISOString() },
        ],
        conversation_tags: [],
        services: [],
        appointments: [],
        reminders: [],
        google_calendar_sync: [],
      };

      fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2), 'utf-8');
      console.log('JSON storage initialized with default structure');
    } else {
      console.log('JSON storage already exists');
    }

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();

