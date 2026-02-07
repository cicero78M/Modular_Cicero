/**
 * Tests for ServiceContainer
 */

import { ServiceContainer } from '../../src/core/ServiceContainer.js';

describe('ServiceContainer', () => {
  let container;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  test('should register and retrieve a service', async () => {
    const mockService = { name: 'test-service' };
    container.register('test', async () => mockService);

    const service = await container.get('test');
    expect(service).toBe(mockService);
  });

  test('should return same instance for singleton', async () => {
    let instanceCount = 0;
    container.register('test', async () => {
      instanceCount++;
      return { id: instanceCount };
    }, { singleton: true });

    const service1 = await container.get('test');
    const service2 = await container.get('test');

    expect(service1).toBe(service2);
    expect(instanceCount).toBe(1);
  });

  test('should resolve dependencies', async () => {
    container.register('dependency', async () => ({ value: 'dep' }));
    container.register('service', async ({ dependency }) => {
      return { dep: dependency };
    }, { dependencies: ['dependency'] });

    const service = await container.get('service');
    expect(service.dep.value).toBe('dep');
  });

  test('should handle optional dependencies', async () => {
    container.register('service', async ({ missing }) => {
      return { hasDep: missing !== null };
    }, { dependencies: ['missing'], optional: true });

    const service = await container.get('service');
    expect(service.hasDep).toBe(false);
  });

  test('should throw error for missing required dependency', async () => {
    container.register('service', async ({ missing }) => {
      return { dep: missing };
    }, { dependencies: ['missing'], optional: false });

    await expect(container.get('service')).rejects.toThrow();
  });

  test('should check if service exists', () => {
    container.register('test', async () => ({}));
    expect(container.has('test')).toBe(true);
    expect(container.has('missing')).toBe(false);
  });

  test('should track initialization status', async () => {
    container.register('test', async () => ({}));
    expect(container.isInitialized('test')).toBe(false);

    await container.get('test');
    expect(container.isInitialized('test')).toBe(true);
  });

  test('should get service status', async () => {
    container.register('test', async () => ({}), { optional: true, lazy: false });
    const status = container.getStatus();

    expect(status.test).toBeDefined();
    expect(status.test.registered).toBe(true);
    expect(status.test.optional).toBe(true);
    expect(status.test.lazy).toBe(false);
  });

  test('should shutdown services with shutdown method', async () => {
    let shutdownCalled = false;
    const service = {
      shutdown: async () => {
        shutdownCalled = true;
      },
    };

    container.register('test', async () => service);
    await container.get('test');

    await container.shutdown();
    expect(shutdownCalled).toBe(true);
  });

  test('should clear state on shutdown', async () => {
    container.register('test', async () => ({}));
    await container.get('test');

    await container.shutdown();
    expect(container.isInitialized('test')).toBe(false);
  });
});
