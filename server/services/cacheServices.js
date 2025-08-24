const { getRedisClient } = require('../Config/redis');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.redis = getRedisClient();
    this.defaultTTL = 300; // 5 minutes
  }

  async get(key) {
    try {
      if (!this.redis) return null;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, data, ttl = this.defaultTTL) {
    try {
      if (!this.redis) return false;
      await this.redis.setEx(key, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      if (!this.redis) return false;
      await this.redis.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  async flushPattern(pattern) {
    try {
      if (!this.redis) return false;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
      return true;
    } catch (error) {
      logger.error('Cache flush pattern error:', error);
      return false;
    }
  }

  // Service-specific cache methods
  getCacheKey(type, ...params) {
    return `sms:${type}:${params.join(':')}`;
  }

  async cacheServices(services) {
    return await this.set(this.getCacheKey('services'), services, 1800); // 30 minutes
  }

  async getCachedServices() {
    return await this.get(this.getCacheKey('services'));
  }

  async cacheCountries(countries) {
    return await this.set(this.getCacheKey('countries'), countries, 3600); // 1 hour
  }

  async getCachedCountries() {
    return await this.get(this.getCacheKey('countries'));
  }

  async cachePrices(country, service, prices) {
    return await this.set(this.getCacheKey('prices', country, service), prices, 600); // 10 minutes
  }

  async getCachedPrices(country, service) {
    return await this.get(this.getCacheKey('prices', country, service));
  }
}

module.exports = new CacheService();
