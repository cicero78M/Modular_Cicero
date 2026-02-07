/**
 * Redis Service Wrapper
 * Provides resilient Redis access with reconnection logic and health checks
 */

import { createClient } from 'redis';
import { env } from '../config/env.js';
import { healthCheck } from './HealthCheck.js';
import { circuitBreakerManager } from './CircuitBreaker.js';

export class RedisService {
  constructor(options = {}) {
    this.url = options.url || env.REDIS_URL;
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectDelay = options.reconnectDelay || 5000;
    this.circuitBreakerName = 'redis';

    // Register health check
    healthCheck.register(
      'redis',
      async () => {
        if (!this.isConnected || !this.client) {
          return { healthy: false, message: 'Redis not connected' };
        }

        try {
          await this.client.ping();
          return { healthy: true, message: 'Redis connection OK' };
        } catch (error) {
          return { healthy: false, message: error.message };
        }
      },
      { timeout: 5000, critical: false } // Not critical - app can run without Redis
    );
  }

  /**
   * Initialize Redis connection
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.client && this.isConnected) {
      console.log('[RedisService] Already connected');
      return;
    }

    try {
      console.log('[RedisService] Connecting to Redis...');
      this.client = createClient({ url: this.url });

      // Event handlers
      this.client.on('error', (err) => {
        console.error('[RedisService] Error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('[RedisService] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.client.on('disconnect', () => {
        console.warn('[RedisService] Disconnected');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('[RedisService] Reconnecting...');
      });

      this.client.on('ready', () => {
        console.log('[RedisService] Ready');
        this.isConnected = true;
      });

      await this.client.connect();
      console.log('[RedisService] Connection established');
    } catch (error) {
      console.error('[RedisService] Failed to connect:', error.message);
      this.isConnected = false;

      // Don't throw - allow app to continue without Redis
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      } else {
        console.error(
          '[RedisService] Max reconnection attempts reached. Redis will be unavailable.'
        );
      }
    }
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `[RedisService] Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`
    );

    setTimeout(() => {
      this.connect().catch((err) => {
        console.error('[RedisService] Reconnection failed:', err.message);
      });
    }, delay);
  }

  /**
   * Execute Redis command with circuit breaker
   * @param {Function} fn - Function to execute
   * @param {Object} options - Options
   * @returns {Promise<any>}
   */
  async execute(fn, options = {}) {
    if (!this.isConnected || !this.client) {
      if (options.throwOnDisconnected) {
        throw new Error('Redis is not connected');
      }
      console.warn('[RedisService] Redis not connected, operation skipped');
      return null;
    }

    return circuitBreakerManager.execute(
      this.circuitBreakerName,
      async () => fn(this.client),
      {
        failureThreshold: 3,
        resetTimeout: 30000,
        monitoringWindow: 60000,
      }
    );
  }

  /**
   * Get a value from Redis
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    return this.execute(async (client) => client.get(key));
  }

  /**
   * Set a value in Redis
   * @param {string} key
   * @param {string} value
   * @param {Object} options - Options (EX, PX, etc.)
   * @returns {Promise<string|null>}
   */
  async set(key, value, options = {}) {
    return this.execute(async (client) => {
      if (options.EX) {
        return client.setEx(key, options.EX, value);
      }
      return client.set(key, value);
    });
  }

  /**
   * Delete a key from Redis
   * @param {string} key
   * @returns {Promise<number|null>}
   */
  async del(key) {
    return this.execute(async (client) => client.del(key));
  }

  /**
   * Check if key exists
   * @param {string} key
   * @returns {Promise<number|null>}
   */
  async exists(key) {
    return this.execute(async (client) => client.exists(key));
  }

  /**
   * Get Redis client (for advanced operations)
   * @returns {Object|null}
   */
  getClient() {
    if (!this.isConnected) {
      console.warn('[RedisService] Client requested but not connected');
      return null;
    }
    return this.client;
  }

  /**
   * Check connection status
   * @returns {boolean}
   */
  isReady() {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get health status
   * @returns {Promise<Object>}
   */
  async getHealth() {
    return healthCheck.check('redis');
  }

  /**
   * Shutdown Redis service
   */
  async shutdown() {
    console.log('[RedisService] Shutting down...');
    if (this.client) {
      try {
        await this.client.quit();
        console.log('[RedisService] Disconnected gracefully');
      } catch (error) {
        console.error('[RedisService] Error during shutdown:', error.message);
      }
      this.client = null;
      this.isConnected = false;
    }
  }
}

// Export singleton instance
export const redisService = new RedisService();
