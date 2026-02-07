/**
 * Feature Flag System
 * Allows enabling/disabling features without code changes or restarts
 */

export class FeatureFlags {
  constructor() {
    this.flags = new Map();
    this.listeners = new Map();
    this.loadFromEnv();
  }

  /**
   * Load feature flags from environment variables
   */
  loadFromEnv() {
    // WhatsApp Service
    this.set('whatsapp.enabled', process.env.WA_SERVICE_SKIP_INIT !== 'true');
    this.set('whatsapp.user_client.enabled', process.env.WA_USER_CLIENT_ENABLED !== 'false');
    this.set('whatsapp.gateway_client.enabled', process.env.WA_GATEWAY_CLIENT_ENABLED !== 'false');

    // Telegram Service
    this.set('telegram.enabled', process.env.TELEGRAM_ENABLED !== 'false');

    // Cron Jobs
    this.set('cron.enabled', process.env.CRON_ENABLED !== 'false');
    this.set('cron.social_media.enabled', process.env.CRON_SOCIAL_MEDIA_ENABLED !== 'false');
    this.set('cron.premium_expiry.enabled', process.env.CRON_PREMIUM_EXPIRY_ENABLED !== 'false');
    this.set('cron.dashboard_subscription.enabled', process.env.CRON_DASHBOARD_SUBSCRIPTION_ENABLED !== 'false');

    // External Services
    this.set('instagram.enabled', process.env.INSTAGRAM_ENABLED !== 'false');
    this.set('tiktok.enabled', process.env.TIKTOK_ENABLED !== 'false');
    this.set('google_contacts.enabled', process.env.GOOGLE_CONTACTS_ENABLED !== 'false');

    // Redis
    this.set('redis.enabled', process.env.REDIS_ENABLED !== 'false');

    // RabbitMQ
    this.set('rabbitmq.enabled', process.env.RABBITMQ_ENABLED !== 'false');

    // Email
    this.set('email.enabled', process.env.EMAIL_ENABLED !== 'false');

    // Maintenance Mode
    this.set('maintenance_mode', process.env.MAINTENANCE_MODE === 'true');

    console.log('[FeatureFlags] Loaded feature flags from environment');
  }

  /**
   * Set a feature flag
   * @param {string} key - Flag key
   * @param {boolean} value - Flag value
   */
  set(key, value) {
    const oldValue = this.flags.get(key);
    this.flags.set(key, value);

    // Notify listeners if value changed
    if (oldValue !== value) {
      this.notifyListeners(key, value, oldValue);
    }
  }

  /**
   * Get a feature flag value
   * @param {string} key - Flag key
   * @param {boolean} defaultValue - Default value if flag not found
   * @returns {boolean}
   */
  get(key, defaultValue = false) {
    return this.flags.has(key) ? this.flags.get(key) : defaultValue;
  }

  /**
   * Check if a feature is enabled
   * @param {string} key - Flag key
   * @returns {boolean}
   */
  isEnabled(key) {
    return this.get(key, false) === true;
  }

  /**
   * Check if a feature is disabled
   * @param {string} key - Flag key
   * @returns {boolean}
   */
  isDisabled(key) {
    return !this.isEnabled(key);
  }

  /**
   * Enable a feature
   * @param {string} key - Flag key
   */
  enable(key) {
    this.set(key, true);
    console.log(`[FeatureFlags] Enabled: ${key}`);
  }

  /**
   * Disable a feature
   * @param {string} key - Flag key
   */
  disable(key) {
    this.set(key, false);
    console.log(`[FeatureFlags] Disabled: ${key}`);
  }

  /**
   * Toggle a feature
   * @param {string} key - Flag key
   */
  toggle(key) {
    this.set(key, !this.isEnabled(key));
    console.log(`[FeatureFlags] Toggled: ${key} = ${this.isEnabled(key)}`);
  }

  /**
   * Add a listener for flag changes
   * @param {string} key - Flag key
   * @param {Function} callback - Callback function
   */
  onChange(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(callback);
  }

  /**
   * Notify listeners of flag changes
   * @param {string} key - Flag key
   * @param {boolean} newValue - New value
   * @param {boolean} oldValue - Old value
   */
  notifyListeners(key, newValue, oldValue) {
    if (!this.listeners.has(key)) {
      return;
    }

    for (const callback of this.listeners.get(key)) {
      try {
        callback(newValue, oldValue);
      } catch (error) {
        console.error(
          `[FeatureFlags] Error in listener for ${key}:`,
          error.message
        );
      }
    }
  }

  /**
   * Get all flags
   * @returns {Object}
   */
  getAll() {
    return Object.fromEntries(this.flags);
  }

  /**
   * Check if system is in maintenance mode
   * @returns {boolean}
   */
  isMaintenanceMode() {
    return this.isEnabled('maintenance_mode');
  }

  /**
   * Enable maintenance mode
   */
  enableMaintenanceMode() {
    this.enable('maintenance_mode');
    console.warn('[FeatureFlags] ⚠️  MAINTENANCE MODE ENABLED');
  }

  /**
   * Disable maintenance mode
   */
  disableMaintenanceMode() {
    this.disable('maintenance_mode');
    console.log('[FeatureFlags] ✓ Maintenance mode disabled');
  }
}

// Export singleton instance
export const featureFlags = new FeatureFlags();
