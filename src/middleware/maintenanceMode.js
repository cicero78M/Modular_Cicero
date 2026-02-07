/**
 * Maintenance Mode Middleware
 * Blocks requests when system is in maintenance mode
 */

import { featureFlags } from '../core/FeatureFlags.js';

/**
 * Check if system is in maintenance mode
 * Returns 503 if in maintenance mode, except for whitelisted paths
 */
export function maintenanceMode(req, res, next) {
  // Skip check for health and status endpoints
  const whitelistedPaths = [
    '/api/health',
    '/api/status',
    '/api/admin/maintenance',
  ];

  const isWhitelisted = whitelistedPaths.some((path) =>
    req.path.startsWith(path)
  );

  if (isWhitelisted) {
    return next();
  }

  // Check if maintenance mode is enabled
  if (featureFlags.isMaintenanceMode()) {
    return res.status(503).json({
      status: 'maintenance',
      message: 'System is currently under maintenance. Please try again later.',
      timestamp: new Date().toISOString(),
    });
  }

  next();
}
