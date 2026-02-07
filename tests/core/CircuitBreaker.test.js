/**
 * Tests for CircuitBreaker
 */

import { CircuitBreaker, CircuitBreakerManager } from '../../src/core/CircuitBreaker.js';

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringWindow: 5000,
    });
  });

  test('should start in CLOSED state', () => {
    expect(breaker.state).toBe('CLOSED');
  });

  test('should execute function successfully', async () => {
    const fn = async () => 'success';
    const result = await breaker.execute(fn);

    expect(result).toBe('success');
    expect(breaker.statistics.successfulCalls).toBe(1);
  });

  test('should track failures', async () => {
    const fn = async () => {
      throw new Error('failed');
    };

    await expect(breaker.execute(fn)).rejects.toThrow('failed');
    expect(breaker.failures.length).toBe(1);
    expect(breaker.statistics.failedCalls).toBe(1);
  });

  test('should open circuit after threshold', async () => {
    const fn = async () => {
      throw new Error('failed');
    };

    // Fail 3 times to reach threshold
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow('failed');
    }

    expect(breaker.state).toBe('OPEN');
  });

  test('should reject calls when circuit is OPEN', async () => {
    const fn = async () => {
      throw new Error('failed');
    };

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow('failed');
    }

    // Try to execute
    await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker');
    expect(breaker.statistics.rejectedCalls).toBe(1);
  });

  test('should transition to HALF_OPEN after timeout', async () => {
    const fn = async () => {
      throw new Error('failed');
    };

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow('failed');
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Should transition to HALF_OPEN - change fn to succeed
    const successFn = async () => 'success';
    await breaker.execute(successFn);
    expect(breaker.state).toBe('CLOSED');
  });

  test('should get state', () => {
    const state = breaker.getState();
    expect(state.name).toBe('test');
    expect(state.state).toBe('CLOSED');
    expect(state.failures).toBe(0);
  });

  test('should reset circuit', async () => {
    const fn = async () => {
      throw new Error('failed');
    };

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow('failed');
    }

    breaker.reset();
    expect(breaker.state).toBe('CLOSED');
    expect(breaker.failures.length).toBe(0);
  });
});

describe('CircuitBreakerManager', () => {
  let manager;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
  });

  test('should create and manage circuit breakers', () => {
    const breaker = manager.getBreaker('test');
    expect(breaker).toBeInstanceOf(CircuitBreaker);
    expect(breaker.name).toBe('test');
  });

  test('should reuse existing circuit breaker', () => {
    const breaker1 = manager.getBreaker('test');
    const breaker2 = manager.getBreaker('test');
    expect(breaker1).toBe(breaker2);
  });

  test('should execute with circuit breaker', async () => {
    const fn = async () => 'success';
    const result = await manager.execute('test', fn);
    expect(result).toBe('success');
  });

  test('should get status of all breakers', async () => {
    await manager.execute('test1', async () => 'success');
    await manager.execute('test2', async () => 'success');

    const status = manager.getStatus();
    expect(status.test1).toBeDefined();
    expect(status.test2).toBeDefined();
  });

  test('should reset specific breaker', async () => {
    const fn = async () => {
      throw new Error('failed');
    };

    // Open the circuit
    for (let i = 0; i < 5; i++) {
      await expect(manager.execute('test', fn)).rejects.toThrow();
    }

    manager.reset('test');
    const breaker = manager.getBreaker('test');
    expect(breaker.state).toBe('CLOSED');
  });

  test('should reset all breakers', async () => {
    const fn = async () => {
      throw new Error('failed');
    };

    // Open multiple circuits
    for (let i = 0; i < 5; i++) {
      await expect(manager.execute('test1', fn)).rejects.toThrow();
      await expect(manager.execute('test2', fn)).rejects.toThrow();
    }

    manager.resetAll();
    expect(manager.getBreaker('test1').state).toBe('CLOSED');
    expect(manager.getBreaker('test2').state).toBe('CLOSED');
  });
});
