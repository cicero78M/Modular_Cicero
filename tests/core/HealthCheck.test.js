/**
 * Tests for HealthCheck
 */

import { HealthCheck } from '../../src/core/HealthCheck.js';

describe('HealthCheck', () => {
  let healthCheck;

  beforeEach(() => {
    healthCheck = new HealthCheck();
  });

  test('should register a health check', () => {
    healthCheck.register('test', async () => ({ healthy: true }));
    expect(healthCheck.checks.has('test')).toBe(true);
  });

  test('should check health and return healthy status', async () => {
    healthCheck.register('test', async () => ({
      healthy: true,
      message: 'All good',
    }));

    const result = await healthCheck.check('test');
    expect(result.status).toBe('healthy');
    expect(result.message).toBe('All good');
  });

  test('should check health and return unhealthy status', async () => {
    healthCheck.register('test', async () => ({
      healthy: false,
      message: 'Service down',
    }));

    const result = await healthCheck.check('test');
    expect(result.status).toBe('unhealthy');
    expect(result.message).toBe('Service down');
  });

  test('should handle timeout', async () => {
    healthCheck.register(
      'test',
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { healthy: true };
      },
      { timeout: 100 }
    );

    const result = await healthCheck.check('test');
    expect(result.status).toBe('unhealthy');
    expect(result.message).toContain('timeout');
  });

  test('should check all health checks', async () => {
    healthCheck.register('test1', async () => ({ healthy: true }));
    healthCheck.register('test2', async () => ({ healthy: true }));

    const result = await healthCheck.checkAll();
    expect(result.status).toBe('healthy');
    expect(result.checks.test1.status).toBe('healthy');
    expect(result.checks.test2.status).toBe('healthy');
  });

  test('should return degraded status when non-critical check fails', async () => {
    healthCheck.register('critical', async () => ({ healthy: true }), {
      critical: true,
    });
    healthCheck.register('optional', async () => ({ healthy: false }), {
      critical: false,
    });

    const result = await healthCheck.checkAll();
    expect(result.status).toBe('degraded');
  });

  test('should return unhealthy status when critical check fails', async () => {
    healthCheck.register('critical', async () => ({ healthy: false }), {
      critical: true,
    });

    const result = await healthCheck.checkAll();
    expect(result.status).toBe('unhealthy');
  });

  test('should get summary', async () => {
    healthCheck.register('test1', async () => ({ healthy: true }));
    healthCheck.register('test2', async () => ({ healthy: false }));

    const summary = await healthCheck.summary();
    expect(summary.total).toBe(2);
    expect(summary.healthy).toBe(1);
    expect(summary.unhealthy).toBe(1);
  });
});
