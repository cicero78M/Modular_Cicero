# Maintenance Procedures

*Last updated: 2026-02-07*

This document provides step-by-step procedures for maintaining the Cicero_V2 system using the modular architecture.

## Table of Contents

1. [System Health Monitoring](#system-health-monitoring)
2. [Enabling Maintenance Mode](#enabling-maintenance-mode)
3. [Service Management](#service-management)
4. [Circuit Breaker Management](#circuit-breaker-management)
5. [Troubleshooting](#troubleshooting)
6. [Restart Procedures](#restart-procedures)
7. [Emergency Procedures](#emergency-procedures)

## System Health Monitoring

### Check Overall Health

```bash
# Quick health check
curl http://localhost:3000/api/health/summary

# Detailed health check
curl http://localhost:3000/api/health

# Complete system status
curl http://localhost:3000/api/status
```

### Interpret Health Status

**Healthy (200)**: All critical services operational
```json
{
  "status": "healthy",
  "total": 5,
  "healthy": 5,
  "unhealthy": 0
}
```

**Degraded (200)**: Non-critical services down, core functionality available
```json
{
  "status": "degraded",
  "checks": {
    "database": { "status": "healthy" },
    "redis": { "status": "unhealthy" },  // Non-critical
    "whatsapp": { "status": "healthy" }
  }
}
```

**Unhealthy (503)**: Critical services down, system compromised
```json
{
  "status": "unhealthy",
  "checks": {
    "database": { "status": "unhealthy" },  // Critical!
    "redis": { "status": "healthy" }
  }
}
```

### Monitoring Best Practices

1. **Regular Checks**: Monitor `/api/health/summary` every 30 seconds
2. **Alert Thresholds**:
   - Degraded status → Warning notification
   - Unhealthy status → Critical alert
   - Circuit breaker open → Warning notification
3. **Log Review**: Check logs for error patterns

## Enabling Maintenance Mode

### When to Use Maintenance Mode

- Database migrations or schema changes
- Deployment of breaking changes
- Infrastructure updates (server restart, etc.)
- Emergency fixes requiring temporary downtime

### Enable Maintenance Mode

**Method 1: Via API**
```bash
curl -X POST http://localhost:3000/api/admin/maintenance/enable
```

**Method 2: Via Environment Variable**
```bash
# Set in .env file
MAINTENANCE_MODE=true

# Restart application
pm2 restart cicero_v2
```

**Method 3: Runtime (in code)**
```javascript
import { featureFlags } from './src/core/FeatureFlags.js';
featureFlags.enableMaintenanceMode();
```

### During Maintenance Mode

- All user requests return 503 status
- Health and status endpoints remain accessible
- Admin endpoints remain accessible
- Display maintenance message to users

### Disable Maintenance Mode

```bash
curl -X POST http://localhost:3000/api/admin/maintenance/disable
```

## Service Management

### Disable a Service

```bash
# Disable WhatsApp service
export WA_SERVICE_SKIP_INIT=true
pm2 restart cicero_v2

# Disable cron jobs
export CRON_ENABLED=false
pm2 restart cicero_v2

# Disable specific cron category
export CRON_SOCIAL_MEDIA_ENABLED=false
pm2 restart cicero_v2
```

### Enable a Service

```bash
# Enable WhatsApp service
export WA_SERVICE_SKIP_INIT=false
pm2 restart cicero_v2

# Enable cron jobs
export CRON_ENABLED=true
pm2 restart cicero_v2
```

### Check Service Status

```bash
curl http://localhost:3000/api/status/services
```

Response shows all registered services and their status:
```json
{
  "services": {
    "database": {
      "registered": true,
      "initialized": true,
      "ready": true
    },
    "whatsapp": {
      "registered": true,
      "initialized": false,
      "ready": false
    }
  }
}
```

## Circuit Breaker Management

### Check Circuit Breaker Status

```bash
curl http://localhost:3000/api/status/circuit-breakers
```

Response:
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
    },
    "externalAPI": {
      "state": "OPEN",
      "failures": 5,
      "nextAttemptTime": "2026-02-07T08:00:00.000Z"
    }
  }
}
```

### Reset a Circuit Breaker

When a service recovers but circuit breaker is still open:

```bash
curl -X POST http://localhost:3000/api/admin/circuit-breakers/database/reset
```

### Circuit Breaker States

- **CLOSED**: Normal operation, all requests pass through
- **OPEN**: Too many failures, requests rejected to prevent cascading
- **HALF_OPEN**: Testing if service recovered

## Troubleshooting

### Database Connection Issues

**Symptoms:**
- Health check shows database unhealthy
- Circuit breaker for database is OPEN
- Errors in logs: "connection refused" or "timeout"

**Solution:**
```bash
# 1. Check database connectivity
psql -h localhost -U cicero -d cicero_db

# 2. Verify database is running
systemctl status postgresql

# 3. Reset circuit breaker once DB is confirmed working
curl -X POST http://localhost:3000/api/admin/circuit-breakers/database/reset

# 4. Check health
curl http://localhost:3000/api/health
```

### Redis Connection Issues

**Symptoms:**
- Health check shows Redis unhealthy
- App still functions (Redis is non-critical)

**Solution:**
```bash
# 1. Check Redis connectivity
redis-cli ping

# 2. Verify Redis is running
systemctl status redis

# 3. Redis will auto-reconnect, no restart needed
# 4. Monitor logs for reconnection
tail -f logs/app.log | grep Redis
```

### WhatsApp Service Not Starting

**Symptoms:**
- WhatsApp service not initialized
- WA-dependent features unavailable

**Solution:**
```bash
# 1. Check if WhatsApp is enabled
curl http://localhost:3000/api/status/feature-flags

# 2. Enable if disabled
export WA_SERVICE_SKIP_INIT=false
pm2 restart cicero_v2

# 3. Check session data
ls -la /path/to/wa/session

# 4. Clear session if corrupted
rm -rf /path/to/wa/session/.wwebjs_auth
pm2 restart cicero_v2
```

### Circuit Breaker Stuck Open

**Symptoms:**
- Circuit breaker remains OPEN after service recovery
- Requests being rejected unnecessarily

**Solution:**
```bash
# 1. Verify service is actually healthy
curl http://localhost:3000/api/health

# 2. Reset the circuit breaker
curl -X POST http://localhost:3000/api/admin/circuit-breakers/SERVICE_NAME/reset

# 3. Monitor for stability
watch -n 5 'curl -s http://localhost:3000/api/status/circuit-breakers'
```

### High Memory Usage

**Symptoms:**
- System running slow
- Memory alerts

**Solution:**
```bash
# 1. Check PM2 memory usage
pm2 monit

# 2. Check for memory leaks
pm2 describe cicero_v2

# 3. Graceful restart
pm2 reload cicero_v2

# 4. If critical, hard restart
pm2 restart cicero_v2
```

## Restart Procedures

### Graceful Restart (Zero Downtime)

```bash
# Using PM2 reload (zero downtime)
pm2 reload cicero_v2

# System will:
# 1. Start new instance
# 2. Wait for new instance to be ready
# 3. Route traffic to new instance
# 4. Shutdown old instance gracefully
```

### Standard Restart

```bash
# Using PM2 restart
pm2 restart cicero_v2

# System will:
# 1. Shutdown current instance (graceful shutdown handlers run)
# 2. Start new instance
# 3. Brief downtime during restart
```

### Emergency Restart

```bash
# Force restart (use only in emergency)
pm2 delete cicero_v2
pm2 start ecosystem.config.js
```

### Verify Restart Success

```bash
# 1. Check PM2 status
pm2 status

# 2. Check logs
pm2 logs cicero_v2 --lines 50

# 3. Check health
curl http://localhost:3000/api/health

# 4. Check all services initialized
curl http://localhost:3000/api/status/services
```

## Emergency Procedures

### Complete System Failure

**When to use**: Multiple critical services down, system unresponsive

**Procedure:**
```bash
# 1. Enable maintenance mode (if accessible)
curl -X POST http://localhost:3000/api/admin/maintenance/enable

# 2. Stop application
pm2 stop cicero_v2

# 3. Verify all dependencies
systemctl status postgresql
systemctl status redis
systemctl status rabbitmq-server

# 4. Restart failed dependencies
systemctl restart postgresql
systemctl restart redis

# 5. Clear problematic state if needed
rm -rf /tmp/cicero_*

# 6. Start application
pm2 start cicero_v2

# 7. Monitor health
watch -n 2 'curl -s http://localhost:3000/api/health/summary'

# 8. Once stable, disable maintenance mode
curl -X POST http://localhost:3000/api/admin/maintenance/disable
```

### Database Corruption

**Procedure:**
```bash
# 1. Enable maintenance mode
curl -X POST http://localhost:3000/api/admin/maintenance/enable

# 2. Stop application
pm2 stop cicero_v2

# 3. Backup database
pg_dump -U cicero cicero_db > backup_$(date +%Y%m%d_%H%M%S).sql

# 4. Restore from last good backup
psql -U cicero cicero_db < backup_TIMESTAMP.sql

# 5. Start application
pm2 start cicero_v2

# 6. Verify health
curl http://localhost:3000/api/health

# 7. Disable maintenance mode
curl -X POST http://localhost:3000/api/admin/maintenance/disable
```

### Cascading Failures

**Symptoms:**
- Multiple circuit breakers OPEN
- Rapid error rate increase
- Services failing sequentially

**Procedure:**
```bash
# 1. Immediate damage control - enable maintenance mode
curl -X POST http://localhost:3000/api/admin/maintenance/enable

# 2. Identify root cause
curl http://localhost:3000/api/status

# 3. Disable affected services via feature flags
curl -X POST http://localhost:3000/api/admin/feature-flags \
  -H "Content-Type: application/json" \
  -d '{"key": "whatsapp.enabled", "value": false}'

# 4. Restart application
pm2 restart cicero_v2

# 5. Gradually re-enable services
curl -X POST http://localhost:3000/api/admin/feature-flags \
  -H "Content-Type: application/json" \
  -d '{"key": "whatsapp.enabled", "value": true}'

# 6. Monitor for stability
watch -n 5 'curl -s http://localhost:3000/api/health/summary'

# 7. Disable maintenance mode once stable
curl -X POST http://localhost:3000/api/admin/maintenance/disable
```

## Routine Maintenance Checklist

### Daily
- [ ] Check health status
- [ ] Review error logs
- [ ] Verify all circuit breakers CLOSED
- [ ] Monitor memory/CPU usage

### Weekly
- [ ] Review failed requests
- [ ] Check database connection pool stats
- [ ] Review circuit breaker statistics
- [ ] Test backup restore procedure

### Monthly
- [ ] Review and update feature flags
- [ ] Analyze service dependencies
- [ ] Update maintenance procedures
- [ ] Test emergency procedures

## Monitoring Integration

### Prometheus Metrics (Future)

The health endpoints can be scraped by Prometheus:
```yaml
scrape_configs:
  - job_name: 'cicero'
    metrics_path: '/api/health'
    static_configs:
      - targets: ['localhost:3000']
```

### Alerting Rules

Example alert rules:
```yaml
- alert: CiceroUnhealthy
  expr: cicero_health_status != "healthy"
  for: 5m
  annotations:
    summary: "Cicero system unhealthy"

- alert: CircuitBreakerOpen
  expr: cicero_circuit_breaker_state == "OPEN"
  for: 10m
  annotations:
    summary: "Circuit breaker stuck open"
```

## Summary

The modular architecture provides comprehensive tools for system maintenance:

✅ **Health Monitoring** - Real-time service status
✅ **Maintenance Mode** - Zero-downtime maintenance window
✅ **Circuit Breakers** - Automatic failure isolation
✅ **Feature Flags** - Runtime service control
✅ **Graceful Shutdown** - Clean restarts
✅ **Service Independence** - Partial functionality during failures

Always follow the procedures in this document to minimize downtime and maintain system stability.
