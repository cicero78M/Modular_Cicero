/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by monitoring and isolating failing services
 */

export class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'unnamed';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringWindow = options.monitoringWindow || 120000; // 2 minutes

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = [];
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.successCount = 0;
    this.statistics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>}
   */
  async execute(fn) {
    this.statistics.totalCalls++;

    // Check circuit state
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        this.statistics.rejectedCalls++;
        throw new Error(
          `Circuit breaker '${this.name}' is OPEN. Service unavailable.`
        );
      }
      // Try transitioning to HALF_OPEN
      this.state = 'HALF_OPEN';
      console.log(`[CircuitBreaker] ${this.name}: Transitioning to HALF_OPEN`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.statistics.successfulCalls++;
    this.successCount++;

    if (this.state === 'HALF_OPEN') {
      // Successfully recovered, close circuit
      this.state = 'CLOSED';
      this.failures = [];
      this.successCount = 0;
      console.log(`[CircuitBreaker] ${this.name}: Circuit CLOSED (recovered)`);
    }
  }

  /**
   * Handle failed execution
   * @param {Error} error
   */
  onFailure(error) {
    this.statistics.failedCalls++;
    this.lastFailureTime = Date.now();
    this.failures.push({
      timestamp: this.lastFailureTime,
      error: error.message,
    });

    // Clean old failures outside monitoring window
    this.failures = this.failures.filter(
      (f) => Date.now() - f.timestamp < this.monitoringWindow
    );

    if (this.state === 'HALF_OPEN') {
      // Failed during recovery, open circuit again
      this.openCircuit();
      return;
    }

    // Check if threshold exceeded
    if (this.failures.length >= this.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit
   */
  openCircuit() {
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + this.resetTimeout;
    this.successCount = 0;
    console.warn(
      `[CircuitBreaker] ${this.name}: Circuit OPEN (${this.failures.length} failures). Will retry at ${new Date(this.nextAttemptTime).toISOString()}`
    );
  }

  /**
   * Get current state
   * @returns {Object}
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures.length,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      statistics: this.statistics,
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = [];
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.successCount = 0;
    console.log(`[CircuitBreaker] ${this.name}: Manually reset`);
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers
 */
export class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create a circuit breaker
   * @param {string} name - Circuit breaker name
   * @param {Object} options - Circuit breaker options
   * @returns {CircuitBreaker}
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ ...options, name }));
    }
    return this.breakers.get(name);
  }

  /**
   * Execute with circuit breaker protection
   * @param {string} name - Circuit breaker name
   * @param {Function} fn - Function to execute
   * @param {Object} options - Circuit breaker options
   * @returns {Promise<any>}
   */
  async execute(name, fn, options = {}) {
    const breaker = this.getBreaker(name, options);
    return breaker.execute(fn);
  }

  /**
   * Get status of all circuit breakers
   * @returns {Object}
   */
  getStatus() {
    const status = {};
    for (const [name, breaker] of this.breakers.entries()) {
      status[name] = breaker.getState();
    }
    return status;
  }

  /**
   * Reset a specific circuit breaker
   * @param {string} name
   */
  reset(name) {
    if (this.breakers.has(name)) {
      this.breakers.get(name).reset();
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Export singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();
