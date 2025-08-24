require('dotenv').config();
const { setupDatabase, initializeTables } = require('../Config/database');
const logger = require('../utils/logger');

async function initializeDatabase() {
  try {
    console.log('🔄 Starting database initialization...');
    
    await setupDatabase();
    console.log('✅ Database connections established');
    
    await initializeTables();
    console.log('✅ All tables created successfully');
    
    console.log('🎉 Database initialization completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };