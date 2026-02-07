/**
 * Service Container - Centralized dependency injection and service management
 * Provides service registration, retrieval, and lifecycle management
 */

export class ServiceContainer {
  constructor() {
    this.services = new Map();
    this.factories = new Map();
    this.singletons = new Map();
    this.initialized = new Map();
  }

  /**
   * Register a service factory
   * @param {string} name - Service name
   * @param {Function} factory - Factory function that creates the service
   * @param {Object} options - Service options (singleton, dependencies, etc.)
   */
  register(name, factory, options = {}) {
    if (this.factories.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    this.factories.set(name, {
      factory,
      singleton: options.singleton !== false, // Default to singleton
      dependencies: options.dependencies || [],
      optional: options.optional || false,
      lazy: options.lazy !== false, // Default to lazy loading
    });

    console.log(`[ServiceContainer] Registered service: ${name}`);
  }

  /**
   * Get a service instance
   * @param {string} name - Service name
   * @returns {Promise<any>} Service instance
   */
  async get(name) {
    // Check if singleton already exists
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    // Check if service is registered
    if (!this.factories.has(name)) {
      throw new Error(`Service '${name}' is not registered`);
    }

    const config = this.factories.get(name);

    // Resolve dependencies
    const dependencies = {};
    for (const dep of config.dependencies) {
      try {
        dependencies[dep] = await this.get(dep);
      } catch (error) {
        if (!config.optional) {
          throw new Error(
            `Failed to resolve dependency '${dep}' for service '${name}': ${error.message}`
          );
        }
        console.warn(
          `[ServiceContainer] Optional dependency '${dep}' not available for '${name}'`
        );
        dependencies[dep] = null;
      }
    }

    // Create service instance
    let instance;
    try {
      instance = await config.factory(dependencies);
      this.initialized.set(name, true);
    } catch (error) {
      throw new Error(`Failed to create service '${name}': ${error.message}`);
    }

    // Store singleton
    if (config.singleton) {
      this.singletons.set(name, instance);
    }

    return instance;
  }

  /**
   * Check if service is available
   * @param {string} name - Service name
   * @returns {boolean}
   */
  has(name) {
    return this.factories.has(name);
  }

  /**
   * Check if service is initialized
   * @param {string} name - Service name
   * @returns {boolean}
   */
  isInitialized(name) {
    return this.initialized.get(name) === true;
  }

  /**
   * Initialize all registered services
   * @returns {Promise<void>}
   */
  async initializeAll() {
    const services = Array.from(this.factories.keys());
    console.log(
      `[ServiceContainer] Initializing ${services.length} services...`
    );

    for (const name of services) {
      const config = this.factories.get(name);
      if (!config.lazy) {
        try {
          await this.get(name);
          console.log(`[ServiceContainer] ✓ Initialized: ${name}`);
        } catch (error) {
          if (config.optional) {
            console.warn(
              `[ServiceContainer] ⚠ Optional service '${name}' failed to initialize:`,
              error.message
            );
          } else {
            console.error(
              `[ServiceContainer] ✗ Failed to initialize '${name}':`,
              error.message
            );
            throw error;
          }
        }
      }
    }

    console.log('[ServiceContainer] All non-lazy services initialized');
  }

  /**
   * Shutdown all services
   * @returns {Promise<void>}
   */
  async shutdown() {
    console.log('[ServiceContainer] Shutting down services...');

    const shutdownPromises = [];

    for (const [name, instance] of this.singletons.entries()) {
      if (instance && typeof instance.shutdown === 'function') {
        shutdownPromises.push(
          instance
            .shutdown()
            .then(() =>
              console.log(`[ServiceContainer] ✓ Shutdown: ${name}`)
            )
            .catch((error) =>
              console.error(
                `[ServiceContainer] ✗ Error shutting down '${name}':`,
                error.message
              )
            )
        );
      }
    }

    await Promise.allSettled(shutdownPromises);
    console.log('[ServiceContainer] All services shutdown complete');

    this.singletons.clear();
    this.initialized.clear();
  }

  /**
   * Get service status
   * @returns {Object} Status of all services
   */
  getStatus() {
    const status = {};

    for (const [name, config] of this.factories.entries()) {
      const isInitialized = this.initialized.get(name) === true;
      const hasSingleton = this.singletons.has(name);

      status[name] = {
        registered: true,
        initialized: isInitialized,
        singleton: config.singleton,
        optional: config.optional,
        lazy: config.lazy,
        ready: isInitialized && (config.singleton ? hasSingleton : true),
      };
    }

    return status;
  }
}

// Export singleton instance
export const container = new ServiceContainer();
