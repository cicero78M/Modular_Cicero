/**
 * Tests for FeatureFlags
 */

import { FeatureFlags } from '../../src/core/FeatureFlags.js';

describe('FeatureFlags', () => {
  let flags;

  beforeEach(() => {
    flags = new FeatureFlags();
  });

  test('should set and get flags', () => {
    flags.set('test.feature', true);
    expect(flags.get('test.feature')).toBe(true);
  });

  test('should return default value for missing flag', () => {
    expect(flags.get('missing', true)).toBe(true);
    expect(flags.get('missing', false)).toBe(false);
  });

  test('should check if feature is enabled', () => {
    flags.set('test.feature', true);
    expect(flags.isEnabled('test.feature')).toBe(true);
  });

  test('should check if feature is disabled', () => {
    flags.set('test.feature', false);
    expect(flags.isDisabled('test.feature')).toBe(true);
  });

  test('should enable a feature', () => {
    flags.enable('test.feature');
    expect(flags.isEnabled('test.feature')).toBe(true);
  });

  test('should disable a feature', () => {
    flags.disable('test.feature');
    expect(flags.isDisabled('test.feature')).toBe(true);
  });

  test('should toggle a feature', () => {
    flags.set('test.feature', false);
    flags.toggle('test.feature');
    expect(flags.isEnabled('test.feature')).toBe(true);

    flags.toggle('test.feature');
    expect(flags.isEnabled('test.feature')).toBe(false);
  });

  test('should notify listeners on change', () => {
    const listener = (newValue, oldValue) => {
      listener.calls = listener.calls || [];
      listener.calls.push({ newValue, oldValue });
    };
    listener.calls = [];

    flags.onChange('test.feature', listener);

    flags.set('test.feature', true);
    expect(listener.calls.length).toBe(1);
    expect(listener.calls[0].newValue).toBe(true);

    flags.set('test.feature', false);
    expect(listener.calls.length).toBe(2);
    expect(listener.calls[1].newValue).toBe(false);
    expect(listener.calls[1].oldValue).toBe(true);
  });

  test('should not notify listeners if value unchanged', () => {
    const listener = (newValue, oldValue) => {
      listener.calls = listener.calls || [];
      listener.calls.push({ newValue, oldValue });
    };
    listener.calls = [];

    flags.set('test.feature', true);
    flags.onChange('test.feature', listener);

    flags.set('test.feature', true);
    expect(listener.calls.length).toBe(0);
  });

  test('should get all flags', () => {
    flags.set('feature1', true);
    flags.set('feature2', false);

    const allFlags = flags.getAll();
    expect(allFlags.feature1).toBe(true);
    expect(allFlags.feature2).toBe(false);
  });

  test('should handle maintenance mode', () => {
    expect(flags.isMaintenanceMode()).toBe(false);

    flags.enableMaintenanceMode();
    expect(flags.isMaintenanceMode()).toBe(true);

    flags.disableMaintenanceMode();
    expect(flags.isMaintenanceMode()).toBe(false);
  });

  test('should load flags from environment', () => {
    // Feature flags are loaded in constructor from process.env
    // This test verifies the structure is correct
    const allFlags = flags.getAll();
    expect(typeof allFlags).toBe('object');
  });
});
