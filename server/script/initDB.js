require('dotenv').config();
const { setupDatabase, initializeTables } = require('../Config/database');
const { testDatabaseSetup} = require('./test-db-setup')
const { runFlutterwaveMigration, getSystemHealth, cleanupOldData } = require('../migration/migrateToSimplified');
const logger = require('../utils/logger');

async function initializeDatabase() {
  try {
    console.log('🔄 Starting database initialization...');
    
    await setupDatabase();
    console.log('✅ Database connections established');
    
    await initializeTables();
    console.log('✅ All tables created successfully');

    await testDatabaseSetup();
    console.log('✅ Flutterwave migration completed');

    await cleanupOldData();
    console.log('✅ Old data cleanup completed');

    // Get system health check (optional)
    const health = await getSystemHealth();
    console.log('✅ System health check completed');
    
    // Optional: Log health metrics
    if (health.metrics) {
      console.log('📊 System Health Metrics:');
      health.metrics.forEach(metric => {
        console.log(`   ${metric.metric}: ${metric.value} (${metric.type})`);
      });
    }

    console.log('🎉 Database initialization completed successfully!');
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