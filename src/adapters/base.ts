/**
 * @fileoverview Base Controller Adapter Interface
 *
 * This module defines the abstract interface that all controller adapters
 * must implement. The adapter pattern allows the Vorio Agent to work with
 * different WiFi controller types (UniFi, MikroTik, etc.) through a
 * unified interface.
 *
 * ## Creating a New Adapter
 *
 * To add support for a new controller type:
 *
 * 1. Create a new file in `src/adapters/` (e.g., `mikrotik.ts`)
 * 2. Create a class that implements `ControllerAdapter`
 * 3. Implement all required methods
 * 4. Register the adapter in `src/adapters/index.ts`
 *
 * See `docs/ADAPTER_GUIDE.md` for detailed instructions.
 *
 * ## Example Implementation
 *
 * ```TypeScript
 * import { ControllerAdapter, ControllerInfo } from './base';
 * import { MappedVoucher, AvailableWLAN, AgentCapabilities } from '../types';
 *
 * export class MyControllerAdapter implements ControllerAdapter {
 *   async login(): Promise<void> {
 *     // Authenticate with the controller
 *   }
 *
 *   async getVouchers(): Promise<MappedVoucher[]> {
 *     // Fetch and normalize vouchers
 *   }
 *
 *   // ... implement other methods
 * }
 * ```
 *
 * @module adapters/base
 * @author RocoByte
 * @license MIT
 */

import { MappedVoucher, AvailableWLAN, AgentCapabilities, ControllerInfo } from '../types/index.js';

// Re-export ControllerInfo for convenience
export type { ControllerInfo } from '../types/index.js';

/**
 * Base interface for all controller adapters.
 *
 * Each adapter (UniFi, MikroTik, etc.) must implement this interface
 * to provide a consistent way for the sync service to interact with
 * different controller types.
 *
 * ## Lifecycle
 *
 * 1. `login()` - Called once at startup to authenticate
 * 2. `getControllerInfo()` - Get controller metadata
 * 3. `getCapabilities()` - Report what the adapter can do
 * 4. `getAvailableWLANs()` - Get available networks
 * 5. `getVouchers()` - Called periodically to fetch vouchers
 * 6. `deleteVoucher()` - Called when a delete command is received
 * 7. `logout()` - Called on shutdown for cleanup
 *
 * ## Error Handling
 *
 * Adapters should throw appropriate errors from `@/core/errors`:
 * - `AuthenticationError` for login failures
 * - `ConnectionError` for network issues
 * - `ControllerError` for API errors
 *
 * @example
 * ```TypeScript
 * class UniFiAdapter implements ControllerAdapter {
 *   async login(): Promise<void> {
 *     try {
 *       await this.client.authenticate();
 *     } catch (error) {
 *       throw new AuthenticationError('Login failed', 'unifi', 'api_key');
 *     }
 *   }
 * }
 * ```
 */
export interface ControllerAdapter {
  /**
   * Authenticate with the controller.
   *
   * This method is called once at startup. It should establish
   * a session or validate credentials. For stateless APIs (like
   * API key auth), this might just validate the key works.
   *
   * @throws AuthenticationError if authentication fails
   * @throws ConnectionError if the controller is unreachable
   */
  login(): Promise<void>;

  /**
   * Disconnect from the controller.
   *
   * Called on graceful shutdown. Should clean up any sessions,
   * close connections, and release resources. This method should
   * not throw errors - log issues and continue.
   */
  logout(): Promise<void>;

  /**
   * Get information about the controller.
   *
   * Returns metadata about the controller such as version and name.
   * This is reported to Vorio Cloud for compatibility tracking.
   *
   * @returns Controller information including version and type
   */
  getControllerInfo(): Promise<ControllerInfo>;

  /**
   * Get all vouchers from the controller.
   *
   * Fetches all vouchers and transforms them to the normalized
   * `MappedVoucher` format. This method is called periodically
   * by the sync service.
   *
   * ## Pagination
   *
   * If the controller API is paginated, the adapter should handle
   * pagination internally and return all vouchers in one array.
   *
   * ## Error Handling
   *
   * If authentication expires, the adapter should attempt to
   * re-authenticate automatically before failing.
   *
   * @returns Array of normalized voucher data
   * @throws ControllerError if fetching vouchers fails
   */
  getVouchers(): Promise<MappedVoucher[]>;

  /**
   * Delete a voucher from the controller.
   *
   * Called when Vorio Cloud sends a delete command. The voucher
   * is identified by its ID (as returned in `MappedVoucher.id`).
   *
   * @param voucherId - The controller's internal ID for the voucher
   * @throws ControllerError if deletion fails (voucher not found, permission denied, etc.)
   */
  deleteVoucher(voucherId: string): Promise<void>;

  /**
   * Check if currently authenticated.
   *
   * Returns true if the adapter has a valid session or the
   * authentication credentials have been validated.
   *
   * @returns True if authenticated, false otherwise
   */
  isAuthenticated(): boolean;

  /**
   * Get the controller type identifier.
   *
   * Returns a string identifying the controller type.
   * This should match the `CONTROLLER_TYPE` config value.
   *
   * @returns Controller type (e.g., 'unifi', 'mikrotik')
   */
  getType(): string;

  /**
   * Get capabilities supported by this adapter.
   *
   * Returns flags indicating what operations this adapter supports.
   * This is reported to Vorio Cloud so it knows what commands
   * can be sent to this agent.
   *
   * @returns Capabilities object with feature flags
   */
  getCapabilities(): AgentCapabilities;

  /**
   * Get available WLANs from the controller.
   *
   * Returns a list of WiFi networks configured on the controller.
   * This is reported to Vorio Cloud for display in the dashboard.
   *
   * If the adapter doesn't support WLAN listing (or it fails),
   * return an empty array instead of throwing.
   *
   * @returns Array of available WLANs, or empty array if not supported
   */
  getAvailableWLANs(): Promise<AvailableWLAN[]>;
}

/**
 * Abstract base class for controller adapters.
 *
 * Provides common functionality and default implementations.
 * Adapters can extend this class instead of implementing
 * the interface directly for convenience.
 *
 * @example
 * ```TypeScript
 * export class MikroTikAdapter extends BaseAdapter {
 *   constructor() {
 *     super('mikrotik');
 *   }
 *
 *   async login(): Promise<void> {
 *     // Implementation
 *   }
 *
 *   // ... other required methods
 * }
 * ```
 */
export abstract class BaseAdapter implements ControllerAdapter {
  /** Controller type identifier */
  protected readonly controllerType: string;

  /** Whether currently authenticated */
  protected authenticated = false;

  /**
   * Create a new adapter instance.
   *
   * @param controllerType - The controller type identifier
   */
  constructor(controllerType: string) {
    this.controllerType = controllerType;
  }

  // Required methods - must be implemented by subclasses
  abstract login(): Promise<void>;
  abstract logout(): Promise<void>;
  abstract getControllerInfo(): Promise<ControllerInfo>;
  abstract getVouchers(): Promise<MappedVoucher[]>;
  abstract deleteVoucher(voucherId: string): Promise<void>;

  /**
   * Check if authenticated.
   * Default implementation returns the `authenticated` flag.
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Get the controller type.
   */
  getType(): string {
    return this.controllerType;
  }

  /**
   * Get adapter capabilities.
   * Default implementation returns basic capabilities.
   * Override in subclass to report actual capabilities.
   */
  getCapabilities(): AgentCapabilities {
    return {
      canListWLANs: false,
      canCreateVouchers: false,
      canDeleteVouchers: false,
    };
  }

  /**
   * Get available WLANs.
   * Default implementation returns empty array.
   * Override in subclass if WLAN listing is supported.
   */
  async getAvailableWLANs(): Promise<AvailableWLAN[]> {
    return [];
  }

  /**
   * Mark as authenticated.
   * Call this from login() implementation on success.
   */
  protected setAuthenticated(value: boolean): void {
    this.authenticated = value;
  }
}
