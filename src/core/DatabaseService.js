/**
 * Database Service Wrapper
 * Provides resilient database access with connection pooling, retries, and health checks
 */

import { query, transactQuery } from '../db/index.js';
import { healthCheck } from './HealthCheck.js';
import { circuitBreakerManager } from './CircuitBreaker.js';

export class DatabaseService {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.circuitBreakerName = 'database';
    this.isHealthy = false;

    // Register health check
    healthCheck.register(
      'database',
      async () => {
        try {
          await query('SELECT 1 as health_check');
          this.isHealthy = true;
          return { healthy: true, message: 'Database connection OK' };
        } catch (error) {
          this.isHealthy = false;
          return { healthy: false, message: error.message };
        }
      },
      { timeout: 5000, critical: true }
    );
  }

  /**
   * Execute a query with retry logic and circuit breaker
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   * @param {Object} options - Query options
   * @returns {Promise<Object>}
   */
  async query(text, params = [], options = {}) {
    const retries = options.retries !== undefined ? options.retries : this.maxRetries;

    return circuitBreakerManager.execute(
      this.circuitBreakerName,
      async () => {
        return this.executeWithRetry(
          () => query(text, params),
          retries,
          `Query: ${text.substring(0, 50)}...`
        );
      },
      {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringWindow: 120000,
      }
    );
  }

  /**
   * Execute a transaction with retry logic
   * @param {Function} callback - Transaction callback
   * @param {Object} options - Transaction options
   * @returns {Promise<any>}
   */
  async transaction(callback, options = {}) {
    const retries = options.retries !== undefined ? options.retries : this.maxRetries;

    return circuitBreakerManager.execute(
      this.circuitBreakerName,
      async () => {
        return this.executeWithRetry(
          () => transactQuery(callback),
          retries,
          'Transaction'
        );
      }
    );
  }

  /**
   * Execute with retry logic
   * @param {Function} fn - Function to execute
   * @param {number} retries - Number of retries
   * @param {string} operation - Operation description
   * @returns {Promise<any>}
   */
  async executeWithRetry(fn, retries, operation) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await fn();
        if (attempt > 0) {
          console.log(`[DatabaseService] ${operation} succeeded after ${attempt} retries`);
        }
        return result;
      } catch (error) {
        lastError = error;

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt < retries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.warn(
            `[DatabaseService] ${operation} failed (attempt ${attempt + 1}/${retries + 1}): ${error.message}. Retrying in ${delay}ms...`
          );
          await this.sleep(delay);
        }
      }
    }

    console.error(
      `[DatabaseService] ${operation} failed after ${retries + 1} attempts`
    );
    throw lastError;
  }

  /**
   * Check if error is non-retryable
   * @param {Error} error
   * @returns {boolean}
   */
  isNonRetryableError(error) {
    const nonRetryableCodes = [
      '23505', // unique_violation
      '23503', // foreign_key_violation
      '23502', // not_null_violation
      '42P01', // undefined_table
      '42703', // undefined_column
    ];

    return error.code && nonRetryableCodes.includes(error.code);
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get database health status
   * @returns {Promise<Object>}
   */
  async getHealth() {
    return healthCheck.check('database');
  }

  /**
   * Shutdown database service
   */
  async shutdown() {
    console.log('[DatabaseService] Shutting down...');
    // The underlying pg pool will be closed by the db module
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
