/**
 * System Status Routes
 * Routes for system health, status, and management endpoints
 */

import express from 'express';
import {
  getHealth,
  getHealthSummary,
  getServiceStatus,
  getCircuitBreakerStatus,
  getFeatureFlags,
  updateFeatureFlag,
  enableMaintenanceMode,
  disableMaintenanceMode,
  resetCircuitBreaker,
  getSystemStatus,
} from '../controller/statusController.js';

const router = express.Router();

// Public health check endpoints
router.get('/health', getHealth);
router.get('/health/summary', getHealthSummary);

// Status endpoints (can be used for monitoring)
router.get('/status', getSystemStatus);
router.get('/status/services', getServiceStatus);
router.get('/status/circuit-breakers', getCircuitBreakerStatus);
router.get('/status/feature-flags', getFeatureFlags);

// Admin endpoints (should be protected in production)
// Note: Add authentication middleware before these routes in app.js
router.post('/admin/feature-flags', updateFeatureFlag);
router.post('/admin/maintenance/enable', enableMaintenanceMode);
router.post('/admin/maintenance/disable', disableMaintenanceMode);
router.post('/admin/circuit-breakers/:name/reset', resetCircuitBreaker);

export default router;
