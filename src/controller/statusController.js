/**
 * System Status Controller
 * Provides endpoints for system health, status, and management
 */

import { container } from '../core/ServiceContainer.js';
import { healthCheck } from '../core/HealthCheck.js';
import { circuitBreakerManager } from '../core/CircuitBreaker.js';
import { featureFlags } from '../core/FeatureFlags.js';

/**
 * Get overall system health
 */
export async function getHealth(req, res) {
  try {
    const health = await healthCheck.checkAll();

    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Get health summary
 */
export async function getHealthSummary(req, res) {
  try {
    const summary = await healthCheck.summary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}

/**
 * Get service container status
 */
export async function getServiceStatus(req, res) {
  try {
    const status = container.getStatus();
    res.json({
      services: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}

/**
 * Get circuit breaker status
 */
export async function getCircuitBreakerStatus(req, res) {
  try {
    const status = circuitBreakerManager.getStatus();
    res.json({
      circuitBreakers: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}

/**
 * Get feature flags
 */
export async function getFeatureFlags(req, res) {
  try {
    const flags = featureFlags.getAll();
    res.json({
      flags,
      maintenanceMode: featureFlags.isMaintenanceMode(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}

/**
 * Update a feature flag (admin only)
 */
export async function updateFeatureFlag(req, res) {
  try {
    const { key, value } = req.body;

    if (!key || typeof value !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request. Requires key (string) and value (boolean)',
      });
    }

    featureFlags.set(key, value);

    res.json({
      status: 'success',
      flag: key,
      value,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}

/**
 * Enable maintenance mode (admin only)
 */
export async function enableMaintenanceMode(req, res) {
  try {
    featureFlags.enableMaintenanceMode();
    res.json({
      status: 'success',
      maintenanceMode: true,
      message: 'Maintenance mode enabled',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}

/**
 * Disable maintenance mode (admin only)
 */
export async function disableMaintenanceMode(req, res) {
  try {
    featureFlags.disableMaintenanceMode();
    res.json({
      status: 'success',
      maintenanceMode: false,
      message: 'Maintenance mode disabled',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}

/**
 * Reset a circuit breaker (admin only)
 */
export async function resetCircuitBreaker(req, res) {
  try {
    const { name } = req.params;

    if (!name) {
      return res.status(400).json({
        status: 'error',
        message: 'Circuit breaker name is required',
      });
    }

    circuitBreakerManager.reset(name);

    res.json({
      status: 'success',
      circuitBreaker: name,
      message: 'Circuit breaker reset',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}

/**
 * Get comprehensive system status
 */
export async function getSystemStatus(req, res) {
  try {
    const [health, services, circuitBreakers] = await Promise.all([
      healthCheck.checkAll(),
      Promise.resolve(container.getStatus()),
      Promise.resolve(circuitBreakerManager.getStatus()),
    ]);

    const flags = featureFlags.getAll();

    res.json({
      health: {
        status: health.status,
        checks: health.checks,
      },
      services,
      circuitBreakers,
      featureFlags: {
        flags,
        maintenanceMode: featureFlags.isMaintenanceMode(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}
