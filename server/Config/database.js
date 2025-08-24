// Config/database.js - Enhanced with session management
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

let pool;
let existingDbPool;

async function setupDatabase() {
  try {
    // Main database pool (fizzbuzz_app)
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 60000,
      timezone: '+00:00'
    });

    // Existing user database pool (fizzbuzz_upmax)
    existingDbPool = mysql.createPool({
      host: process.env.EXISTING_DB_HOST,
      user: process.env.EXISTING_DB_USER,
      password: process.env.EXISTING_DB_PASSWORD,
      database: process.env.EXISTING_DB_NAME,
      port: process.env.EXISTING_DB_PORT ? Number(process.env.EXISTING_DB_PORT) : 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 60000,
      timezone: '+00:00'
    });

    // Test connections
    await pool.query('SELECT 1');
    await existingDbPool.query('SELECT 1');
    
    logger.info('Database connections established successfully');
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}

async function initializeTables() {
  try {
    logger.info('Initializing database tables...');

    // User Sessions Table - For managing active sessions
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        refresh_token VARCHAR(255) UNIQUE NOT NULL,
        access_token TEXT,
        expires_at TIMESTAMP NOT NULL,
        refresh_expires_at TIMESTAMP NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_session_token (session_token),
        INDEX idx_refresh_token (refresh_token),
        INDEX idx_expires_at (expires_at),
        INDEX idx_active (is_active, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // SMS User Account Settings Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sms_user_accounts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        api_key TEXT,
        balance DECIMAL(10, 2) DEFAULT 0.00,
        total_spent DECIMAL(10, 2) DEFAULT 0.00,
        total_numbers_purchased INT DEFAULT 0,
        account_status ENUM('active', 'suspended', 'pending') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Number Purchase History Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS number_purchases (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        activation_id VARCHAR(100) UNIQUE,
        phone_number VARCHAR(20),
        country_code VARCHAR(5),
        service_name VARCHAR(100),
        service_code VARCHAR(50),
        price DECIMAL(10, 4),
        status ENUM('waiting', 'received', 'cancelled', 'expired', 'used') DEFAULT 'waiting',
        sms_code VARCHAR(10),
        sms_text TEXT,
        purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiry_date TIMESTAMP NULL,
        received_at TIMESTAMP NULL,
        INDEX idx_user_status (user_id, status),
        INDEX idx_activation (activation_id),
        INDEX idx_purchase_date (purchase_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Available Services Cache Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS available_services (
        id INT PRIMARY KEY AUTO_INCREMENT,
        service_code VARCHAR(50) UNIQUE,
        service_name VARCHAR(200),
        service_icon VARCHAR(500),
        category VARCHAR(100),
        is_popular BOOLEAN DEFAULT FALSE,
        min_price DECIMAL(10, 4),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_category (category),
        INDEX idx_popular (is_popular)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Country Services Pricing Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS country_services (
        id INT PRIMARY KEY AUTO_INCREMENT,
        country_code VARCHAR(5),
        country_name VARCHAR(100),
        service_code VARCHAR(50),
        price DECIMAL(10, 4),
        available_count INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_country_service (country_code, service_code),
        INDEX idx_country (country_code),
        INDEX idx_service (service_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Transaction History Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        transaction_type ENUM('deposit', 'purchase', 'refund') NOT NULL,
        amount DECIMAL(10, 4) NOT NULL,
        balance_before DECIMAL(10, 4),
        balance_after DECIMAL(10, 4),
        reference_id VARCHAR(100),
        description TEXT,
        status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_transactions (user_id, created_at),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // User Favorites Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        service_code VARCHAR(50),
        country_code VARCHAR(5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_favorite (user_id, service_code, country_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // API Request Logs Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS api_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        endpoint VARCHAR(255),
        method VARCHAR(10),
        request_data TEXT,
        response_data TEXT,
        status_code INT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_logs (user_id, created_at),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Insert default popular services
    await pool.execute(`
      INSERT IGNORE INTO available_services (service_code, service_name, category, is_popular, min_price) VALUES 
      ('wa', 'WhatsApp', 'messaging', true, 0.20),
      ('tg', 'Telegram', 'messaging', true, 0.15),
      ('go', 'Google', 'social', true, 0.25),
      ('fb', 'Facebook', 'social', true, 0.30),
      ('ig', 'Instagram', 'social', true, 0.35),
      ('tw', 'Twitter', 'social', true, 0.40),
      ('vk', 'VKontakte', 'social', false, 0.10),
      ('ok', 'Odnoklassniki', 'social', false, 0.12),
      ('vi', 'Viber', 'messaging', false, 0.18),
      ('uber', 'Uber', 'services', true, 0.45)
    `);

    logger.info('All database tables initialized successfully');
  } catch (error) {
    logger.error('Table initialization failed:', error);
    throw error;
  }
}

function getPool() {
  return pool;
}

function getExistingDbPool() {
  return existingDbPool;
}

module.exports = {
  setupDatabase,
  initializeTables,
  getPool,
  getExistingDbPool
};