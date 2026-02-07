/**
 * Health Check System
 * Provides health monitoring for all services
 */

export class HealthCheck {
  constructor() {
    this.checks = new Map();
  }

  /**
   * Register a health check
   * @param {string} name - Check name
   * @param {Function} checkFn - Function that returns health status
   * @param {Object} options - Check options (timeout, critical, etc.)
   */
  register(name, checkFn, options = {}) {
    this.checks.set(name, {
      checkFn,
      timeout: options.timeout || 5000,
      critical: options.critical !== false, // Default to critical
      interval: options.interval || null,
    });
  }

  /**
   * Run a single health check
   * @param {string} name - Check name
   * @returns {Promise<Object>} Health status
   */
  async check(name) {
    if (!this.checks.has(name)) {
      return {
        name,
        status: 'unknown',
        message: 'Health check not registered',
      };
    }

    const { checkFn, timeout, critical } = this.checks.get(name);
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        checkFn(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Health check timeout')),
            timeout
          )
        ),
      ]);

      const duration = Date.now() - startTime;

      return {
        name,
        status: result.healthy ? 'healthy' : 'unhealthy',
        message: result.message || null,
        details: result.details || {},
        critical,
        duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        name,
        status: 'unhealthy',
        message: error.message,
        critical,
        duration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Run all health checks
   * @returns {Promise<Object>} Overall health status
   */
  async checkAll() {
    const results = {};
    const checks = Array.from(this.checks.keys());

    await Promise.all(
      checks.map(async (name) => {
        results[name] = await this.check(name);
      })
    );

    // Determine overall status
    const allHealthy = Object.values(results).every(
      (r) => r.status === 'healthy'
    );
    const anyCriticalUnhealthy = Object.values(results).some(
      (r) => r.status === 'unhealthy' && r.critical
    );

    let overallStatus = 'healthy';
    if (anyCriticalUnhealthy) {
      overallStatus = 'unhealthy';
    } else if (!allHealthy) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      checks: results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get health status summary
   * @returns {Promise<Object>}
   */
  async summary() {
    const health = await this.checkAll();
    const total = Object.keys(health.checks).length;
    const healthy = Object.values(health.checks).filter(
      (c) => c.status === 'healthy'
    ).length;
    const unhealthy = total - healthy;

    return {
      status: health.status,
      total,
      healthy,
      unhealthy,
      timestamp: health.timestamp,
    };
  }
}

// Export singleton instance
export const healthCheck = new HealthCheck();
