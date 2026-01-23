/**
 * @fileoverview Configuration Management for Vorio Agent
 *
 * This module handles all configuration loading, validation, and access.
 * Configuration is loaded from environment variables (with .env file support)
 * and validated at startup to catch configuration errors early.
 *
 * ## Environment Variables
 *
 * ### Required (always)
 * - `VORIO_AGENT_TOKEN`: Agent authentication token
 *
 * ### Optional
 * - `VORIO_API_URL`: Vorio Cloud API endpoint. Default: 'https://api.vorio.app'
 *
 * ### Controller Type
 * - `CONTROLLER_TYPE`: Controller type (unifi, mikrotik, openwrt, custom). Default: 'unifi'
 *
 * ### UniFi Controller (required if CONTROLLER_TYPE=unifi)
 * - `UNIFI_HOST`: Controller hostname or IP address
 * - `UNIFI_PORT`: Controller port. Default: 443
 * - `UNIFI_API_KEY`: API key authentication (recommended for UniFi 8.0+)
 * - `UNIFI_USERNAME`: Username for legacy authentication
 * - `UNIFI_PASSWORD`: Password for legacy authentication
 * - `UNIFI_SITE`: Site name. Default: 'default'
 * - `UNIFI_SKIP_SSL_VERIFY`: Skip SSL verification. Default: false
 *
 * ### Sync Settings
 * - `SYNC_INTERVAL_MS`: Voucher sync interval in ms. Default: 120000 (2 minutes)
 * - `COMMAND_POLL_INTERVAL_MS`: Command poll interval in ms. Default: 10000 (10 seconds)
 *
 * ## Usage Example
 *
 * ```TypeScript
 * import { config, validateConfig } from '@/core/config';
 *
 * // Validate at startup (throws on error)
 * validateConfig();
 *
 * // Access configuration
 * console.log(config.vorio.apiUrl);
 * console.log(config.unifi.host);
 * ```
 *
 * @module core/config
 * @author RocoByte
 * @license MIT
 */

import dotenv from 'dotenv';
import { ConfigurationError } from '../errors/index.js';

// Load .env file if present
dotenv.config();

// ============================================================================
// Types
// ============================================================================

/**
 * Supported controller types.
 *
 * - `unifi`: Ubiquiti UniFi Controller
 * - `mikrotik`: MikroTik RouterOS (planned)
 * - `openwrt`: OpenWRT (planned)
 * - `custom`: Custom integration (planned)
 */
export type ControllerType = 'unifi' | 'mikrotik' | 'openwrt' | 'custom';

/**
 * UniFi controller configuration.
 */
export interface UniFiConfig {
  /** Controller hostname or IP address */
  host: string;
  /** Controller port (default: 443) */
  port: number;
  /** API key for authentication (UniFi 8.0+) */
  apiKey: string;
  /** Username for legacy authentication */
  username: string;
  /** Password for legacy authentication */
  password: string;
  /** Site name (default: 'default') */
  site: string;
  /** Skip SSL certificate verification */
  skipSslVerify: boolean;
}

/**
 * MikroTik controller configuration (planned).
 */
export interface MikroTikConfig {
  /** Controller hostname or IP address */
  host: string;
  /** API port (default: 8728) */
  port: number;
  /** API username */
  username: string;
  /** API password */
  password: string;
  /** Use SSL for API connection */
  useSsl: boolean;
}

/**
 * Vorio Cloud configuration.
 */
export interface VorioConfig {
  /** Vorio API URL */
  apiUrl: string;
  /** Agent authentication token */
  agentToken: string;
}

/**
 * Sync configuration.
 */
export interface SyncConfig {
  /** Interval between voucher syncs in milliseconds */
  intervalMs: number;
  /** Interval between command polls in milliseconds */
  commandPollIntervalMs: number;
}

/**
 * Complete application configuration.
 */
export interface AppConfig {
  /** Controller type (determines which adapter is used) */
  controllerType: ControllerType;
  /** Vorio Cloud configuration */
  vorio: VorioConfig;
  /** UniFi controller configuration */
  unifi: UniFiConfig;
  /** MikroTik configuration (planned) */
  mikrotik: MikroTikConfig;
  /** Sync configuration */
  sync: SyncConfig;
  /** Computed UniFi base URL */
  readonly unifiBaseUrl: string;
  /** Computed MikroTik base URL */
  readonly mikrotikBaseUrl: string;
}

// ============================================================================
// Environment Helpers
// ============================================================================

/**
 * Get a required environment variable.
 * Throws ConfigurationError if not set.
 *
 * @param name - Environment variable name
 * @returns Environment variable value
 * @throws ConfigurationError if variable is not set
 * @internal
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new ConfigurationError(
      `Missing required environment variable: ${name}`,
      name
    );
  }
  return value.trim();
}

/**
 * Get an optional environment variable with a default value.
 *
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Environment variable value or default
 * @internal
 */
function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  return value.trim();
}

/**
 * Get an optional numeric environment variable.
 *
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set or invalid
 * @returns Parsed number or default
 * @internal
 */
function optionalEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;

  const num = parseInt(value, 10);
  if (isNaN(num)) {
    return defaultValue;
  }
  return num;
}

/**
 * Get an optional boolean environment variable.
 *
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Boolean value (true if 'true' or '1')
 * @internal
 */
function optionalEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Valid controller types.
 * @internal
 */
const VALID_CONTROLLER_TYPES: ControllerType[] = [
  'unifi',
  'mikrotik',
  'openwrt',
  'custom',
];

/**
 * Load controller type from environment.
 * @internal
 */
function loadControllerType(): ControllerType {
  const type = optionalEnv('CONTROLLER_TYPE', 'unifi') as ControllerType;

  if (!VALID_CONTROLLER_TYPES.includes(type)) {
    throw new ConfigurationError(
      `Invalid CONTROLLER_TYPE: '${type}'. Must be one of: ${VALID_CONTROLLER_TYPES.join(', ')}`,
      'CONTROLLER_TYPE'
    );
  }

  return type;
}

/** Default Vorio API URL */
const DEFAULT_VORIO_API_URL = 'https://api.vorio.app';

/**
 * Load Vorio configuration.
 * Only the agent token is required.
 * @internal
 */
function loadVorioConfig(): VorioConfig {
  return {
    apiUrl: optionalEnv('VORIO_API_URL', DEFAULT_VORIO_API_URL),
    agentToken: requireEnv('VORIO_AGENT_TOKEN'),
  };
}

/**
 * Load UniFi configuration.
 * Host is required only if controllerType is 'unifi'.
 * @internal
 */
function loadUniFiConfig(controllerType: ControllerType): UniFiConfig {
  const isUnifi = controllerType === 'unifi';

  return {
    host: isUnifi ? requireEnv('UNIFI_HOST') : optionalEnv('UNIFI_HOST', ''),
    port: optionalEnvNumber('UNIFI_PORT', 443),
    apiKey: optionalEnv('UNIFI_API_KEY', ''),
    username: optionalEnv('UNIFI_USERNAME', ''),
    password: optionalEnv('UNIFI_PASSWORD', ''),
    site: optionalEnv('UNIFI_SITE', 'default'),
    skipSslVerify: optionalEnvBool('UNIFI_SKIP_SSL_VERIFY', false),
  };
}

/**
 * Load MikroTik configuration.
 * Required fields only if controllerType is 'mikrotik'.
 * @internal
 */
function loadMikroTikConfig(controllerType: ControllerType): MikroTikConfig {
  const isMikrotik = controllerType === 'mikrotik';

  return {
    host: isMikrotik
      ? requireEnv('MIKROTIK_HOST')
      : optionalEnv('MIKROTIK_HOST', ''),
    port: optionalEnvNumber('MIKROTIK_PORT', 8728),
    username: isMikrotik
      ? requireEnv('MIKROTIK_USERNAME')
      : optionalEnv('MIKROTIK_USERNAME', ''),
    password: isMikrotik
      ? requireEnv('MIKROTIK_PASSWORD')
      : optionalEnv('MIKROTIK_PASSWORD', ''),
    useSsl: optionalEnvBool('MIKROTIK_USE_SSL', false),
  };
}

/**
 * Load sync configuration.
 * @internal
 */
function loadSyncConfig(): SyncConfig {
  return {
    intervalMs: optionalEnvNumber('SYNC_INTERVAL_MS', 120000), // 2 minutes
    commandPollIntervalMs: optionalEnvNumber('COMMAND_POLL_INTERVAL_MS', 10000), // 10 seconds
  };
}

/**
 * Build the complete configuration object.
 * @internal
 */
function buildConfig(): AppConfig {
  const controllerType = loadControllerType();
  const unifi = loadUniFiConfig(controllerType);
  const mikrotik = loadMikroTikConfig(controllerType);

  return {
    controllerType,
    vorio: loadVorioConfig(),
    unifi,
    mikrotik,
    sync: loadSyncConfig(),

    // Computed URLs
    get unifiBaseUrl(): string {
      return `https://${this.unifi.host}:${this.unifi.port}`;
    },

    get mikrotikBaseUrl(): string {
      const protocol = this.mikrotik.useSsl ? 'https' : 'http';
      return `${protocol}://${this.mikrotik.host}:${this.mikrotik.port}`;
    },
  };
}

// ============================================================================
// Exported Configuration
// ============================================================================

/**
 * Application configuration singleton.
 *
 * This object contains all configuration loaded from environment variables.
 * Access it directly after importing.
 *
 * @example
 * ```TypeScript
 * import { config } from '@/core/config';
 *
 * console.log(config.vorio.apiUrl);
 * console.log(config.unifi.host);
 * ```
 */
export const config: AppConfig = buildConfig();

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation result for configuration.
 */
export interface ValidationResult {
  /** Whether configuration is valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
}

/**
 * Validate the complete configuration.
 *
 * This function performs additional validation beyond the basic
 * required/optional checks, including:
 * - URL format validation
 * - Authentication method completeness
 * - Numeric range validation
 *
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```TypeScript
 * const result = validateConfig();
 * if (!result.valid) {
 *   console.error('Configuration errors:', result.errors);
 *   process.exit(1);
 * }
 * if (result.warnings.length > 0) {
 *   console.warn('Configuration warnings:', result.warnings);
 * }
 * ```
 */
export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate Vorio URL format
  try {
    new URL(config.vorio.apiUrl);
  } catch {
    errors.push(`VORIO_API_URL is not a valid URL: ${config.vorio.apiUrl}`);
  }

  // Validate agent token format
  if (!config.vorio.agentToken.startsWith('vat_')) {
    warnings.push(
      'VORIO_AGENT_TOKEN does not start with "vat_" - this might be an invalid token'
    );
  }

  // Validate UniFi configuration
  if (config.controllerType === 'unifi') {
    // Check authentication method
    const hasApiKey = !!config.unifi.apiKey;
    const hasCredentials = !!config.unifi.username && !!config.unifi.password;

    if (!hasApiKey && !hasCredentials) {
      errors.push(
        'UniFi authentication not configured. ' +
          'Set either UNIFI_API_KEY (recommended) or both UNIFI_USERNAME and UNIFI_PASSWORD'
      );
    }

    if (hasApiKey && hasCredentials) {
      warnings.push(
        'Both API key and username/password are configured. ' +
          'API key will be used (recommended).'
      );
    }

    // Validate port range
    if (config.unifi.port < 1 || config.unifi.port > 65535) {
      errors.push(`UNIFI_PORT must be between 1 and 65535, got: ${config.unifi.port}`);
    }

    // SSL warning
    if (config.unifi.skipSslVerify) {
      warnings.push(
        'SSL verification is disabled (UNIFI_SKIP_SSL_VERIFY=true). ' +
          'This is insecure and should only be used for development.'
      );
    }
  }

  // Validate MikroTik configuration
  if (config.controllerType === 'mikrotik') {
    warnings.push('MikroTik support is not yet implemented.');
  }

  // Validate OpenWRT configuration
  if (config.controllerType === 'openwrt') {
    warnings.push('OpenWRT support is not yet implemented.');
  }

  // Validate custom configuration
  if (config.controllerType === 'custom') {
    warnings.push('Custom integration support is not yet implemented.');
  }

  // Validate sync intervals
  if (config.sync.intervalMs < 10000) {
    warnings.push(
      `SYNC_INTERVAL_MS is very low (${config.sync.intervalMs}ms). ` +
        'This might cause high load on the controller.'
    );
  }

  if (config.sync.commandPollIntervalMs < 1000) {
    warnings.push(
      `COMMAND_POLL_INTERVAL_MS is very low (${config.sync.commandPollIntervalMs}ms). ` +
        'This might cause high API usage.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate configuration and throw on errors.
 *
 * Convenience function that validates configuration and throws
 * a ConfigurationError if any validation errors are found.
 * Warnings are logged but don't cause an error.
 *
 * @throws ConfigurationError if configuration is invalid
 *
 * @example
 * ```TypeScript
 * import { validateConfigOrThrow } from '@/core/config';
 *
 * // At application startup
 * validateConfigOrThrow(); // Throws if invalid
 * ```
 */
export function validateConfigOrThrow(): void {
  const result = validateConfig();

  if (!result.valid) {
    const errorMessage =
      'Configuration validation failed:\n' +
      result.errors.map((e) => `  - ${e}`).join('\n');

    throw new ConfigurationError(errorMessage);
  }
}

/**
 * Get a redacted configuration for logging.
 *
 * Returns a copy of the configuration with sensitive values
 * (passwords, tokens, API keys) replaced with '[REDACTED]'.
 *
 * @returns Configuration object safe for logging
 *
 * @example
 * ```TypeScript
 * import { getRedactedConfig } from '@/core/config';
 *
 * console.log('Configuration:', getRedactedConfig());
 * // Output shows host, port, etc. but passwords are hidden
 * ```
 */
export function getRedactedConfig(): Record<string, unknown> {
  return {
    controllerType: config.controllerType,
    vorio: {
      apiUrl: config.vorio.apiUrl,
      agentToken: config.vorio.agentToken ? '[REDACTED]' : '(not set)',
    },
    unifi: {
      host: config.unifi.host || '(not set)',
      port: config.unifi.port,
      site: config.unifi.site,
      apiKey: config.unifi.apiKey ? '[REDACTED]' : '(not set)',
      username: config.unifi.username || '(not set)',
      password: config.unifi.password ? '[REDACTED]' : '(not set)',
      skipSslVerify: config.unifi.skipSslVerify,
    },
    sync: {
      intervalMs: config.sync.intervalMs,
      commandPollIntervalMs: config.sync.commandPollIntervalMs,
    },
  };
}

