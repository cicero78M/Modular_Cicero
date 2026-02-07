/**
 * Graceful Shutdown Manager
 * Handles clean shutdown of all services
 */

export class ShutdownManager {
  constructor() {
    this.handlers = [];
    this.isShuttingDown = false;
    this.timeout = 30000; // 30 seconds default timeout
    this.initialized = false;
  }

  /**
   * Register a shutdown handler
   * @param {string} name - Handler name
   * @param {Function} handler - Async function to call on shutdown
   * @param {number} priority - Execution priority (higher = earlier)
   */
  register(name, handler, priority = 0) {
    this.handlers.push({ name, handler, priority });
    // Sort by priority (descending)
    this.handlers.sort((a, b) => b.priority - a.priority);
    console.log(`[ShutdownManager] Registered shutdown handler: ${name} (priority: ${priority})`);
  }

  /**
   * Initialize shutdown listeners
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    // Handle various shutdown signals
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGHUP', () => this.shutdown('SIGHUP'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('[ShutdownManager] Uncaught exception:', error);
      this.shutdown('uncaughtException', 1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[ShutdownManager] Unhandled rejection:', reason);
      console.error('Promise:', promise);
      this.shutdown('unhandledRejection', 1);
    });

    this.initialized = true;
    console.log('[ShutdownManager] Initialized shutdown handlers');
  }

  /**
   * Execute graceful shutdown
   * @param {string} signal - Shutdown signal
   * @param {number} exitCode - Exit code (default 0)
   */
  async shutdown(signal = 'SIGTERM', exitCode = 0) {
    if (this.isShuttingDown) {
      console.log('[ShutdownManager] Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    console.log(`\n[ShutdownManager] Received ${signal}, starting graceful shutdown...`);

    const shutdownPromise = this.executeHandlers();
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.error(
          `[ShutdownManager] Shutdown timeout (${this.timeout}ms) reached, forcing exit`
        );
        resolve();
      }, this.timeout);
    });

    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
      console.log('[ShutdownManager] Graceful shutdown complete');
    } catch (error) {
      console.error('[ShutdownManager] Error during shutdown:', error);
      exitCode = 1;
    }

    process.exit(exitCode);
  }

  /**
   * Execute all shutdown handlers
   */
  async executeHandlers() {
    console.log(`[ShutdownManager] Executing ${this.handlers.length} shutdown handlers...`);

    for (const { name, handler } of this.handlers) {
      try {
        console.log(`[ShutdownManager] Running: ${name}...`);
        await handler();
        console.log(`[ShutdownManager] ✓ Completed: ${name}`);
      } catch (error) {
        console.error(`[ShutdownManager] ✗ Error in ${name}:`, error.message);
      }
    }
  }

  /**
   * Set shutdown timeout
   * @param {number} timeout - Timeout in milliseconds
   */
  setTimeout(timeout) {
    this.timeout = timeout;
  }
}

// Export singleton instance
export const shutdownManager = new ShutdownManager();
