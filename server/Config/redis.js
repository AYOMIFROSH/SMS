// Config/redis.js
const redis = require('redis');
const logger = require('../utils/logger');

let client;

async function setupRedis() {
  try {
    const clientOptions = {};

    if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
      // Explicit socket config (prefer this to avoid URL/TLS ambiguity)
      clientOptions.socket = {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        tls: (process.env.REDIS_TLS === 'true') || false,
        // prefer IPv4 to avoid slow IPv6 lookups if any
        family: 4,
        // reasonable connect timeout (ms)
        connectTimeout: 10000
      };
      if (process.env.REDIS_PASSWORD) clientOptions.password = process.env.REDIS_PASSWORD;
      if (process.env.REDIS_USERNAME) clientOptions.username = process.env.REDIS_USERNAME;
    } else if (process.env.REDIS_URL) {
      // Fallback to URL, but set explicit socket flags as well
      let url = process.env.REDIS_URL;
      clientOptions.url = url;
      clientOptions.socket = {
        tls: (process.env.REDIS_TLS === 'true') || false,
        family: 4,
        connectTimeout: 10000
      };
    } else {
      // default to localhost
      clientOptions.socket = { host: '127.0.0.1', port: 6379, tls: false, family: 4, connectTimeout: 10000 };
    }

    client = redis.createClient(clientOptions);

    client.on('error', (err) => {
      logger.error('Redis error:', err);
    });

    client.on('connect', () => {
      logger.info('Redis socket connected');
    });

    client.on('ready', () => {
      logger.info('Redis ready to use');
    });

    await client.connect();
    logger.info('Redis connected');
  } catch (error) {
    logger.error('Redis connection failed:', error);
    // Redis optional
  }
}

function getRedisClient() {
  return client;
}

module.exports = {
  setupRedis,
  getRedisClient
};
