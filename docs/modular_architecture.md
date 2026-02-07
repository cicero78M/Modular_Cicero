# Modular Architecture Guide

*Last updated: 2026-02-07*

This document describes the modular architecture improvements implemented in Cicero_V2 to enable independent service management, graceful degradation, and zero-downtime maintenance.

## Overview

The modular architecture provides:

1. **Service Container** - Centralized dependency injection and lifecycle management
2. **Health Monitoring** - Comprehensive health checks for all services
3. **Circuit Breakers** - Automatic failure isolation to prevent cascading failures
4. **Feature Flags** - Runtime service enabling/disabling without code changes
5. **Graceful Shutdown** - Clean service shutdown on termination
6. **Maintenance Mode** - Zero-downtime maintenance capability

## Core Components

### Service Container (`src/core/ServiceContainer.js`)

The Service Container manages all service dependencies and lifecycle:

```javascript
import { container } from './src/core/ServiceContainer.js';

// Register a service
container.register('myService', async (dependencies) => {
  // Initialize and return service
  return new MyService(dependencies.database);
}, {
  singleton: true,
  dependencies: ['database'],
  optional: false,
  lazy: false
});

// Get a service
const myService = await container.get('myService');
```

**Options:**
- `singleton`: Create once and reuse (default: true)
- `dependencies`: Array of service names this service depends on
- `optional`: Whether service is optional (default: false)
- `lazy`: Initialize on-demand vs at startup (default: true)

### Health Check System (`src/core/HealthCheck.js`)

Monitor service health in real-time:

```javascript
import { healthCheck } from './src/core/HealthCheck.js';

// Register a health check
healthCheck.register('myService', async () => {
  const isHealthy = await myService.ping();
  return {
    healthy: isHealthy,
    message: isHealthy ? 'Service OK' : 'Service down',
    details: { /* additional info */ }
  };
}, {
  timeout: 5000,
  critical: true
});

// Check health
const health = await healthCheck.checkAll();
// Returns: { status: 'healthy|degraded|unhealthy', checks: {...} }
```

**Health Endpoints:**
- `GET /api/health` - Full health check
- `GET /api/health/summary` - Quick summary
- `GET /api/status` - Complete system status

### Circuit Breaker (`src/core/CircuitBreaker.js`)

Prevent cascading failures by isolating failing services:

```javascript
import { circuitBreakerManager } from './src/core/CircuitBreaker.js';

// Execute with circuit breaker protection
const result = await circuitBreakerManager.execute('externalAPI', async () => {
  return await fetch('https://external-api.com/data');
}, {
  failureThreshold: 5,      // Open after 5 failures
  resetTimeout: 60000,      // Try again after 60s
  monitoringWindow: 120000  // Count failures in 2min window
});
```

**Circuit States:**
- `CLOSED`: Normal operation, requests pass through
- `OPEN`: Too many failures, requests rejected immediately
- `HALF_OPEN`: Testing if service recovered

### Feature Flags (`src/core/FeatureFlags.js`)

Enable/disable features at runtime:

```javascript
import { featureFlags } from './src/core/FeatureFlags.js';

// Check if feature is enabled
if (featureFlags.isEnabled('whatsapp.enabled')) {
  await sendWhatsAppMessage();
}

// Enable/disable features
featureFlags.disable('cron.social_media.enabled');
featureFlags.enable('telegram.enabled');

// Maintenance mode
featureFlags.enableMaintenanceMode();
```

**Environment Variables:**
```bash
# Disable WhatsApp service
WA_SERVICE_SKIP_INIT=true

# Disable specific cron jobs
CRON_SOCIAL_MEDIA_ENABLED=false
CRON_PREMIUM_EXPIRY_ENABLED=false

# Disable external services
INSTAGRAM_ENABLED=false
TIKTOK_ENABLED=false
REDIS_ENABLED=false

# Enable maintenance mode
MAINTENANCE_MODE=true
```

### Resilient Services

#### Database Service (`src/core/DatabaseService.js`)

Provides database access with retry logic and circuit breaker:

```javascript
import { databaseService } from './src/core/DatabaseService.js';

// Query with automatic retries
const result = await databaseService.query(
  'SELECT * FROM users WHERE id = $1',
  [userId],
  { retries: 3 }
);

// Transaction with retries
await databaseService.transaction(async (client) => {
  await client.query('INSERT INTO logs...');
  await client.query('UPDATE users...');
});
```

**Features:**
- Automatic retry on transient failures
- Circuit breaker protection
- Connection health monitoring
- Non-retryable error detection

#### Redis Service (`src/core/RedisService.js`)

Provides Redis access with reconnection logic:

```javascript
import { redisService } from './src/core/RedisService.js';

// Operations with automatic reconnection
await redisService.set('key', 'value', { EX: 3600 });
const value = await redisService.get('key');

// Check if ready
if (redisService.isReady()) {
  // Redis available
}
```

**Features:**
- Automatic reconnection with exponential backoff
- Circuit breaker protection
- Graceful degradation (app runs without Redis)
- Connection health monitoring

### Bootstrap System (`src/core/Bootstrap.js`)

Centralized service initialization:

```javascript
import { initializeServices } from './src/core/Bootstrap.js';

// Initialize all services
await initializeServices();
```

**Initialization Order:**
1. Core services (Database, Redis)
2. WhatsApp services (if enabled)
3. Telegram service (if enabled)
4. OTP worker (if enabled)
5. Cron jobs (if enabled)

### Graceful Shutdown (`src/core/ShutdownManager.js`)

Clean shutdown on termination:

```javascript
import { shutdownManager } from './src/core/ShutdownManager.js';

// Register shutdown handler
shutdownManager.register('myService', async () => {
  await myService.close();
}, 100); // Priority (higher = earlier)

// Handlers execute automatically on SIGTERM, SIGINT, SIGHUP
```

## Service Independence

### Isolation Principles

1. **Service Failures Don't Cascade**
   - Each service has a circuit breaker
   - Failed services are isolated automatically
   - Other services continue operating

2. **Optional Dependencies**
   - Redis failure → App continues without caching
   - WhatsApp failure → REST API still works
   - Telegram failure → WhatsApp still works

3. **Graceful Degradation**
   - Services degrade functionality instead of failing completely
   - Feature flags allow manual service disabling
   - Circuit breakers prevent resource exhaustion

### Example: WhatsApp Service Failure

**Before modular architecture:**
```
WhatsApp fails → 30+ services crash → Entire app unusable
```

**After modular architecture:**
```
WhatsApp fails → Circuit breaker opens → WhatsApp disabled
                ↓
Other services continue:
  - REST API works
  - Database operations work
  - User authentication works
  - Dashboard displays "WhatsApp temporarily unavailable"
```

## Maintenance Mode

### Enabling Maintenance Mode

**Via API:**
```bash
curl -X POST http://localhost:3000/api/admin/maintenance/enable
```

**Via Environment:**
```bash
MAINTENANCE_MODE=true npm start
```

**Via Feature Flags:**
```javascript
import { featureFlags } from './src/core/FeatureFlags.js';
featureFlags.enableMaintenanceMode();
```

### During Maintenance Mode

- All requests return 503 status
- Health and status endpoints remain accessible
- Admin endpoints remain accessible
- No data operations are performed

### Disabling Maintenance Mode

```bash
curl -X POST http://localhost:3000/api/admin/maintenance/disable
```

## Monitoring Endpoints

### Health Check
```bash
GET /api/health
```

Returns:
```json
{
  "status": "healthy|degraded|unhealthy",
  "checks": {
    "database": {
      "status": "healthy",
      "message": "Database connection OK",
      "duration": 5
    },
    "redis": {
      "status": "healthy",
      "message": "Redis connection OK",
      "duration": 2
    }
  },
  "timestamp": "2026-02-07T07:23:00.000Z"
}
```

### System Status
```bash
GET /api/status
```

Returns complete system status including:
- Health checks
- Service container status
- Circuit breaker states
- Feature flags

### Circuit Breaker Status
```bash
GET /api/status/circuit-breakers
```

Returns:
```json
{
  "circuitBreakers": {
    "database": {
      "state": "CLOSED",
      "failures": 0,
      "statistics": {
        "totalCalls": 1234,
        "successfulCalls": 1230,
        "failedCalls": 4,
        "rejectedCalls": 0
      }
    }
  }
}
```

## Best Practices

### 1. Service Registration

Always register services with proper dependencies:

```javascript
container.register('myService', async ({ database, redis }) => {
  return new MyService(database, redis);
}, {
  dependencies: ['database', 'redis'],
  optional: false  // Required service
});
```

### 2. Error Handling

Use try-catch with graceful degradation:

```javascript
async function myFeature() {
  try {
    const data = await externalAPI.fetch();
    return data;
  } catch (error) {
    console.error('External API failed:', error);
    // Return cached data or default value
    return getCachedData();
  }
}
```

### 3. Circuit Breaker Usage

Wrap external service calls:

```javascript
import { circuitBreakerManager } from './src/core/CircuitBreaker.js';

async function fetchExternalData() {
  return circuitBreakerManager.execute('externalAPI', async () => {
    return await externalAPI.getData();
  });
}
```

### 4. Health Checks

Register health checks for all critical services:

```javascript
healthCheck.register('myService', async () => {
  const isHealthy = await myService.ping();
  return { healthy: isHealthy, message: '...' };
}, { critical: true });
```

### 5. Feature Flags

Check feature flags before using optional services:

```javascript
if (featureFlags.isEnabled('instagram.enabled')) {
  await fetchInstagramPosts();
}
```

## Migration Guide

### Migrating Existing Services

1. **Register service in container:**
   ```javascript
   // In Bootstrap.js
   container.register('myService', async ({ dependencies }) => {
     return await initMyService(dependencies);
   }, { dependencies: ['database'] });
   ```

2. **Add health check:**
   ```javascript
   healthCheck.register('myService', async () => {
     return { healthy: await myService.isHealthy() };
   });
   ```

3. **Add circuit breaker:**
   ```javascript
   // In service code
   return circuitBreakerManager.execute('myService', async () => {
     return await myService.operation();
   });
   ```

4. **Add feature flag:**
   ```javascript
   // Check before using
   if (featureFlags.isEnabled('myService.enabled')) {
     await myService.doWork();
   }
   ```

## Troubleshooting

### Service Won't Start

Check service status:
```bash
curl http://localhost:3000/api/status/services
```

Look for initialization errors in logs:
```bash
grep "ServiceContainer" logs/app.log
```

### Circuit Breaker Stuck Open

Reset circuit breaker:
```bash
curl -X POST http://localhost:3000/api/admin/circuit-breakers/myService/reset
```

### Service Health Degraded

Check health details:
```bash
curl http://localhost:3000/api/health
```

Review specific service logs for error details.

## Summary

The modular architecture provides:

✅ **Independent Services** - Services can fail without affecting others
✅ **Graceful Degradation** - Partial functionality maintained during failures
✅ **Zero-Downtime Maintenance** - Enable maintenance mode without restart
✅ **Automatic Recovery** - Circuit breakers automatically retry failed services
✅ **Runtime Configuration** - Feature flags enable/disable features without code changes
✅ **Comprehensive Monitoring** - Health checks and status endpoints for all services
✅ **Clean Shutdown** - Graceful shutdown prevents data loss

This architecture ensures high availability and maintainability for the Cicero_V2 system.
