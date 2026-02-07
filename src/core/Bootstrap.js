/**
 * Service Bootstrap
 * Centralized service initialization with proper error handling and dependencies
 */

import { container } from './ServiceContainer.js';
import { shutdownManager } from './ShutdownManager.js';
import { featureFlags } from './FeatureFlags.js';
import { databaseService } from './DatabaseService.js';
import { redisService } from './RedisService.js';

/**
 * Register all core services in the container
 */
export function registerCoreServices() {
  console.log('[Bootstrap] Registering core services...');

  // Database Service
  container.register(
    'database',
    async () => {
      console.log('[Bootstrap] Initializing database service...');
      return databaseService;
    },
    {
      singleton: true,
      lazy: false,
      optional: false,
      dependencies: [],
    }
  );

  // Redis Service
  container.register(
    'redis',
    async () => {
      if (!featureFlags.isEnabled('redis.enabled')) {
        console.log('[Bootstrap] Redis is disabled by feature flag');
        return null;
      }

      console.log('[Bootstrap] Initializing Redis service...');
      await redisService.connect();
      return redisService;
    },
    {
      singleton: true,
      lazy: false,
      optional: true, // App can run without Redis
      dependencies: [],
    }
  );

  console.log('[Bootstrap] Core services registered');
}

/**
 * Register WhatsApp services
 */
export function registerWhatsAppServices() {
  console.log('[Bootstrap] Registering WhatsApp services...');

  container.register(
    'whatsapp',
    async () => {
      if (!featureFlags.isEnabled('whatsapp.enabled')) {
        console.log('[Bootstrap] WhatsApp is disabled by feature flag');
        return null;
      }

      console.log('[Bootstrap] Initializing WhatsApp services...');
      // Lazy import to avoid circular dependencies
      const { waClient, waUserClient, waGatewayClient } = await import(
        '../service/waService.js'
      );

      return {
        waClient,
        waUserClient,
        waGatewayClient,
      };
    },
    {
      singleton: true,
      lazy: false,
      optional: true, // App can partially run without WhatsApp
      dependencies: ['database', 'redis'],
    }
  );

  console.log('[Bootstrap] WhatsApp services registered');
}

/**
 * Register Telegram service
 */
export function registerTelegramService() {
  console.log('[Bootstrap] Registering Telegram service...');

  container.register(
    'telegram',
    async () => {
      if (!featureFlags.isEnabled('telegram.enabled')) {
        console.log('[Bootstrap] Telegram is disabled by feature flag');
        return null;
      }

      console.log('[Bootstrap] Initializing Telegram service...');
      const { initTelegramBot } = await import('../service/telegramService.js');
      const bot = await initTelegramBot();
      return bot;
    },
    {
      singleton: true,
      lazy: false,
      optional: true,
      dependencies: ['whatsapp'],
    }
  );

  console.log('[Bootstrap] Telegram service registered');
}

/**
 * Register OTP worker
 */
export function registerOtpWorker() {
  console.log('[Bootstrap] Registering OTP worker...');

  container.register(
    'otpWorker',
    async () => {
      if (!featureFlags.isEnabled('email.enabled')) {
        console.log('[Bootstrap] Email/OTP is disabled by feature flag');
        return null;
      }

      console.log('[Bootstrap] Initializing OTP worker...');
      const { startOtpWorker } = await import('../service/otpQueue.js');
      await startOtpWorker();
      return true;
    },
    {
      singleton: true,
      lazy: false,
      optional: true,
      dependencies: ['redis'],
    }
  );

  console.log('[Bootstrap] OTP worker registered');
}

/**
 * Register cron jobs
 */
export function registerCronJobs() {
  console.log('[Bootstrap] Registering cron jobs...');

  container.register(
    'cronJobs',
    async ({ whatsapp }) => {
      if (!featureFlags.isEnabled('cron.enabled')) {
        console.log('[Bootstrap] Cron jobs are disabled by feature flag');
        return null;
      }

      console.log('[Bootstrap] Initializing cron jobs...');
      const cronManifest = (await import('../cron/cronManifest.js')).default;
      const { registerDirRequestCrons } = await import(
        '../cron/dirRequest/index.js'
      );

      // Load cron buckets
      const cronBuckets = cronManifest.reduce(
        (buckets, { bucket, modulePath }) => {
          if (!bucket || !modulePath) return buckets;
          if (!buckets[bucket]) buckets[bucket] = [];

          if (!buckets[bucket].includes(modulePath)) {
            buckets[bucket].push(modulePath);
          }

          return buckets;
        },
        { always: [] }
      );

      const loadedCronModules = new Set();

      async function loadCronModules(modules = []) {
        const pendingModules = modules.filter(
          (modulePath) => !loadedCronModules.has(modulePath)
        );
        if (!pendingModules.length) return false;

        await Promise.all(
          pendingModules.map(async (modulePath) => {
            await import(modulePath);
            loadedCronModules.add(modulePath);
            console.log(`[CRON] Activated ${modulePath}`);
          })
        );

        return true;
      }

      // Load always-active crons
      if (cronBuckets.always && cronBuckets.always.length > 0) {
        await loadCronModules(cronBuckets.always).catch((err) =>
          console.error('[CRON] Failed to activate always cron bucket', err)
        );
      }

      // Schedule WA-dependent crons if WhatsApp is available
      if (whatsapp) {
        const { waClient, waGatewayClient } = whatsapp;

        // Schedule cron buckets based on WA client readiness
        if (waClient && cronBuckets.waClient) {
          waClient.on('ready', async () => {
            console.log('[CRON] WA client ready, loading WA crons...');
            await loadCronModules(cronBuckets.waClient).catch((err) =>
              console.error('[CRON] Failed to activate WA cron bucket', err)
            );
          });
        }

        // Register dir request crons
        if (waGatewayClient) {
          registerDirRequestCrons(waGatewayClient);
        }
      }

      return { cronBuckets, loadedCronModules };
    },
    {
      singleton: true,
      lazy: false,
      optional: true,
      dependencies: ['whatsapp'],
    }
  );

  console.log('[Bootstrap] Cron jobs registered');
}

/**
 * Register shutdown handlers
 */
export function registerShutdownHandlers() {
  console.log('[Bootstrap] Registering shutdown handlers...');

  // Redis shutdown
  shutdownManager.register(
    'redis',
    async () => {
      if (redisService.isReady()) {
        await redisService.shutdown();
      }
    },
    100 // High priority
  );

  // Database shutdown (handled by underlying pg pool)
  shutdownManager.register(
    'database',
    async () => {
      console.log('[Shutdown] Database connections will be closed by pg pool');
    },
    90
  );

  // Container shutdown
  shutdownManager.register(
    'container',
    async () => {
      await container.shutdown();
    },
    10 // Low priority - shutdown last
  );

  shutdownManager.initialize();
  console.log('[Bootstrap] Shutdown handlers registered');
}

/**
 * Initialize all services
 */
export async function initializeServices() {
  console.log('[Bootstrap] Starting service initialization...');

  try {
    // Register all services
    registerCoreServices();
    registerWhatsAppServices();
    registerTelegramService();
    registerOtpWorker();
    registerCronJobs();
    registerShutdownHandlers();

    // Initialize all non-lazy services
    await container.initializeAll();

    console.log('[Bootstrap] ✓ All services initialized successfully');
    return true;
  } catch (error) {
    console.error('[Bootstrap] ✗ Service initialization failed:', error);
    throw error;
  }
}
