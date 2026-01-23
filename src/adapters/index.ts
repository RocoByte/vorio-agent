/**
 * @fileoverview Controller Adapter Factory
 *
 * This module provides a factory pattern for creating controller adapters.
 * It allows the application to work with different controller types through
 * a unified interface.
 *
 * ## Supported Controllers
 *
 * | Type      | Status        | Description                              |
 * |-----------|---------------|------------------------------------------|
 * | `unifi`   | Implemented   | Ubiquiti UniFi Controller                |
 * | `mikrotik`| Planned       | MikroTik RouterOS                        |
 * | `openwrt` | Planned       | OpenWRT with captive portal              |
 * | `custom`  | Planned       | Custom integration framework             |
 *
 * ## Usage Example
 *
 * ```TypeScript
 * import { getAdapter, createAdapter } from './adapters';
 *
 * // Get singleton adapter (uses config.controllerType)
 * const adapter = getAdapter();
 * await adapter.login();
 *
 * // Or create a specific adapter type
 * const unifiAdapter = createAdapter('unifi');
 * ```
 *
 * ## Adding New Adapters
 *
 * To add support for a new controller type:
 *
 * 1. Create adapter class implementing `ControllerAdapter` in `./adapters/`
 * 2. Import and register it in this file's `createAdapter()` function
 * 3. Add the type to `ControllerType` in `./core/config`
 *
 * @module adapters
 * @author RocoByte
 * @license MIT
 */

import { config, ControllerType } from '../core/index.js';
import { ConfigurationError } from '../core/index.js';
import { createLogger } from '../core/index.js';
import { ControllerAdapter, ControllerInfo, BaseAdapter } from './base.js';
import { UniFiAdapter, getUniFiAdapter, resetUniFiAdapter } from './unifi.js';

// ============================================================================
// Re-exports
// ============================================================================

export type { ControllerAdapter, ControllerInfo } from './base.js';
export { BaseAdapter } from './base.js';
export { UniFiAdapter, getUniFiAdapter, resetUniFiAdapter } from './unifi.js';

// ============================================================================
// Logger
// ============================================================================

const logger = createLogger('Adapter');

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new adapter instance for the specified controller type.
 *
 * This factory function creates a new instance each time it's called.
 * For singleton behavior, use `getAdapter()` instead.
 *
 * @param type - Controller type (defaults to config.controllerType)
 * @returns New adapter instance
 * @throws ConfigurationError if the controller type is not supported
 *
 * @example
 * ```TypeScript
 * // Create adapter based on config
 * const adapter = createAdapter();
 *
 * // Create specific adapter type
 * const unifiAdapter = createAdapter('unifi');
 * ```
 */
export function createAdapter(type?: ControllerType): ControllerAdapter {
  const adapterType = type || config.controllerType;

  logger.debug('Creating adapter', { type: adapterType });

  switch (adapterType) {
    case 'unifi':
      return new UniFiAdapter();

    case 'mikrotik':
      throw new ConfigurationError(
        'MikroTik adapter is not yet implemented. ' +
          'Please check https://github.com/RocoByte/vorio-agent for updates.',
        'CONTROLLER_TYPE'
      );

    case 'openwrt':
      throw new ConfigurationError(
        'OpenWRT adapter is not yet implemented. ' +
          'Please check https://github.com/RocoByte/vorio-agent for updates.',
        'CONTROLLER_TYPE'
      );

    case 'custom':
      throw new ConfigurationError(
        'Custom adapter is not yet implemented. ' +
          'See docs/ADAPTER_GUIDE.md for creating your own adapter.',
        'CONTROLLER_TYPE'
      );

    default:
      throw new ConfigurationError(
        `Unknown controller type: '${adapterType}'. ` +
          `Supported types: unifi, mikrotik (planned), openwrt (planned), custom (planned)`,
        'CONTROLLER_TYPE'
      );
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

/** Singleton adapter instance */
let adapterInstance: ControllerAdapter | null = null;

/**
 * Get the singleton adapter instance.
 *
 * Creates the adapter on first call based on `config.controllerType`.
 * Subsequent calls return the same instance.
 *
 * @returns Singleton adapter instance
 * @throws ConfigurationError if the controller type is not supported
 *
 * @example
 * ```TypeScript
 * const adapter = getAdapter();
 * await adapter.login();
 * const vouchers = await adapter.getVouchers();
 * ```
 */
export function getAdapter(): ControllerAdapter {
  if (!adapterInstance) {
    logger.info('Initializing controller adapter', {
      type: config.controllerType,
    });
    adapterInstance = createAdapter();
  }
  return adapterInstance;
}

/**
 * Reset the singleton adapter instance.
 *
 * Clears the cached adapter instance. The next call to `getAdapter()`
 * will create a new instance. This is useful for:
 * - Testing with different configurations
 * - Reconfiguring the adapter at runtime
 *
 * @example
 * ```TypeScript
 * // Clear existing adapter
 * resetAdapter();
 *
 * // Change config...
 *
 * // Get fresh adapter with new config
 * const newAdapter = getAdapter();
 * ```
 */
export function resetAdapter(): void {
  logger.debug('Resetting adapter instance');
  adapterInstance = null;

  // Also reset controller-specific singletons
  resetUniFiAdapter();
}

/**
 * Check if an adapter instance exists.
 *
 * @returns True if an adapter instance has been created
 */
export function hasAdapter(): boolean {
  return adapterInstance !== null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get list of supported controller types.
 *
 * Returns information about which controller types are supported
 * and their implementation status.
 *
 * @returns Array of supported controller types with status
 */
export function getSupportedControllers(): Array<{
  type: ControllerType;
  name: string;
  implemented: boolean;
  description: string;
}> {
  return [
    {
      type: 'unifi',
      name: 'UniFi Controller',
      implemented: true,
      description: 'Ubiquiti UniFi Network Application (8.0+ with API key, or legacy with username/password)',
    },
    {
      type: 'mikrotik',
      name: 'MikroTik RouterOS',
      implemented: false,
      description: 'MikroTik RouterOS with User Manager (planned)',
    },
    {
      type: 'openwrt',
      name: 'OpenWRT',
      implemented: false,
      description: 'OpenWRT with captive portal package (planned)',
    },
    {
      type: 'custom',
      name: 'Custom Integration',
      implemented: false,
      description: 'Custom adapter for other controller types (planned)',
    },
  ];
}
