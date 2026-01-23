/**
 * @fileoverview Type Definitions for Vorio Agent
 *
 * This module contains all TypeScript interfaces and types used throughout
 * the application. Types are organized into categories:
 *
 * - **Vorio API Types**: Types for Vorio Cloud API communication
 * - **UniFi API Types**: Types for UniFi Controller API responses
 * - **Internal Types**: Normalized types used within the agent
 *
 * ## Type Naming Conventions
 *
 * - `Vorio*`: Types related to Vorio Cloud API
 * - `UniFi*`: Types for UniFi Controller API
 * - `Mapped*`: Normalized/transformed types for internal use
 * - `Agent*`: Types specific to the agent's internal state
 *
 * @module types
 * @author RocoByte
 * @license MIT
 */

// ============================================================================
// Vorio Cloud API Types
// ============================================================================

/**
 * Command received from Vorio Cloud.
 *
 * Commands are instructions sent from Vorio Cloud to the agent,
 * telling it to perform specific actions like syncing vouchers
 * or deleting a specific voucher.
 *
 * @example
 * ```TypeScript
 * const command: VorioCommand = {
 *   id: 'cmd_123',
 *   type: 'sync_now',
 *   createdAt: '2024-01-15T10:30:00Z'
 * };
 * ```
 */
export interface VorioCommand {
  /** Unique command identifier */
  id: string;

  /**
   * Type of command to execute.
   * - `sync_now`: Immediately sync all vouchers
   * - `delete_voucher`: Delete a specific voucher from the controller
   * - `disconnect`: Gracefully disconnect the agent
   */
  type: 'sync_now' | 'delete_voucher' | 'disconnect';

  /**
   * Additional data for the command.
   * Content depends on command type:
   * - `delete_voucher`: `{ voucherId?: string, voucherCode?: string }`
   */
  payload?: Record<string, unknown>;

  /** ISO 8601 timestamp when the command was created */
  createdAt: string;
}

/**
 * Response from Vorio Cloud after agent connection.
 *
 * Returned when the agent successfully connects to Vorio Cloud.
 * Contains identifiers needed for subsequent API calls.
 */
export interface VorioConnectResponse {
  /** Whether connection was successful */
  success: boolean;

  /** Unique connection ID for this session */
  connectionId: string;

  /** Project ID this agent belongs to */
  projectId: string;

  /** Human-readable status message */
  message: string;
}

/**
 * Response from Vorio Cloud after voucher synchronization.
 *
 * Returned after successfully uploading vouchers to Vorio Cloud.
 */
export interface VorioSyncResponse {
  /** Whether sync was successful */
  success: boolean;

  /** Number of vouchers that were synced */
  syncedCount: number;

  /** Project ID the vouchers were synced to */
  projectId: string;

  /** ISO 8601 timestamp of the sync */
  syncedAt: string;
}

/**
 * Response containing pending commands from Vorio Cloud.
 */
export interface VorioCommandsResponse {
  /** List of pending commands to process */
  commands: VorioCommand[];
}

// ============================================================================
// UniFi Controller API Types
// ============================================================================

/**
 * Voucher data from UniFi Controller.
 *
 * This interface supports both the legacy UniFi Controller API (snake_case)
 * and the new UniFi Integration API (camelCase). The agent normalizes
 * these to the `MappedVoucher` format for internal use.
 *
 * ## Field Mapping
 *
 * | Legacy API        | New API              | Description                    |
 * |-------------------|----------------------|--------------------------------|
 * | `_id`             | `id`                 | Unique voucher identifier      |
 * | `code`            | `code`               | Voucher code (e.g., "12345")   |
 * | `duration`        | `timeLimitMinutes`   | Duration in minutes            |
 * | `quota`           | `authorizedGuestLimit` | Max guests allowed           |
 * | `used`            | `authorizedGuestCount` | Times used                   |
 * | `create_time`     | `createdAt`          | Creation timestamp             |
 * | `start_time`      | `activatedAt`        | First use timestamp            |
 * | `qos_rate_max_up` | `txRateLimitKbps`    | Upload speed limit (kbps)      |
 * | `qos_rate_max_down`| `rxRateLimitKbps`   | Download speed limit (kbps)    |
 */
export interface UniFiVoucher {
  // ---- Legacy API fields (snake_case) ----

  /** Voucher ID (legacy format: MongoDB ObjectId) */
  _id?: string;

  /** Site ID where voucher belongs */
  site_id?: string;

  /** Creation timestamp (Unix timestamp in seconds) */
  create_time?: number;

  /** Voucher code (always present) */
  code: string;

  /** Whether this is a hotspot voucher */
  for_hotspot?: boolean;

  /** Admin who created the voucher */
  admin_name?: string;

  /**
   * Usage quota (legacy).
   * - 0: Unlimited uses
   * - 1: Single use
   * - >1: Multi-use with limit
   */
  quota?: number;

  /** Duration in minutes (legacy) */
  duration?: number;

  /** Number of times used (legacy) */
  used?: number;

  /** Whether QoS limits are applied */
  qos_overwrite?: boolean;

  /** Data usage limit in bytes */
  qos_usage_quota?: number;

  /** Upload bandwidth limit (kbps) */
  qos_rate_max_up?: number;

  /** Download bandwidth limit (kbps) */
  qos_rate_max_down?: number;

  /** Optional note/description */
  note?: string;

  /**
   * Voucher status (legacy).
   * - `VALID_ONE`: Valid, single use
   * - `VALID_MULTI`: Valid, multi-use
   * - `USED`: Already used (single-use voucher)
   * - `EXPIRED`: Expired
   */
  status?: 'VALID_ONE' | 'VALID_MULTI' | 'USED' | 'EXPIRED' | string;

  /** Timestamp when voucher expires (Unix timestamp) */
  status_expires?: number;

  /** Timestamp of first use (Unix timestamp) */
  start_time?: number;

  /** Timestamp when expired/will expire (Unix timestamp) */
  end_time?: number;

  // ---- New Integration API fields (camelCase) ----

  /** Voucher ID (new format: UUID) */
  id?: string;

  /** Creation timestamp (ISO 8601 date-time) */
  createdAt?: string;

  /** Voucher name/note */
  name?: string;

  /** Maximum number of guests that can use this voucher */
  authorizedGuestLimit?: number;

  /** Number of guests that have used this voucher */
  authorizedGuestCount?: number;

  /** Timestamp when first used (ISO 8601 date-time) */
  activatedAt?: string;

  /** Timestamp when voucher expires (ISO 8601 date-time) */
  expiresAt?: string;

  /** Whether the voucher has expired */
  expired?: boolean;

  /** Duration in minutes (new API) */
  timeLimitMinutes?: number;

  /** Data usage limit in megabytes */
  dataUsageLimitMBytes?: number;

  /** Download bandwidth limit (kbps, new API) */
  rxRateLimitKbps?: number;

  /** Upload bandwidth limit (kbps, new API) */
  txRateLimitKbps?: number;
}

/**
 * Login response from UniFi Controller.
 *
 * Used with legacy username/password authentication.
 */
export interface UniFiLoginResponse {
  meta: {
    /** Response code: 'ok' for success, 'error' for failure */
    rc: 'ok' | 'error';
    /** Error message if rc is 'error' */
    msg?: string;
  };
  data: unknown[];
}

/**
 * Voucher list response from UniFi Controller.
 *
 * Used with legacy API endpoint `/api/s/{site}/stat/voucher`.
 */
export interface UniFiVouchersResponse {
  meta: {
    /** Response code: 'ok' for success, 'error' for failure */
    rc: 'ok' | 'error';
    /** Error message if rc is 'error' */
    msg?: string;
  };
  /** Array of voucher data */
  data: UniFiVoucher[];
}

/**
 * Controller info from UniFi.
 */
export interface UniFiControllerInfo {
  /** Controller software version */
  version: string;
  /** Controller name/hostname */
  name?: string;
}

/**
 * WLAN configuration from UniFi Controller.
 *
 * Supports both legacy and new API formats.
 */
export interface UniFiWLAN {
  // ---- Legacy API fields ----

  /** WLAN ID (legacy: MongoDB ObjectId) */
  _id?: string;

  /** SSID name (legacy field name) */
  name?: string;

  /** Whether WLAN is enabled (legacy) */
  enabled?: boolean;

  /** Security type (legacy) */
  security?: string;

  /** WiFi password (legacy) */
  x_passphrase?: string;

  /** Whether this is a guest network (legacy) */
  is_guest?: boolean;

  /** Guest network policy type */
  guest_policy?: string;

  // ---- New Integration API fields ----

  /** WLAN ID (new: UUID) */
  id?: string;

  /** SSID name (new API) */
  ssid?: string;

  /** Whether WLAN is enabled (new API) */
  isEnabled?: boolean;

  /** WLAN type: 'open', 'secure', etc. */
  wlanType?: string;

  /** Security mode (new API) */
  securityMode?: string;

  /** WiFi password (new API) */
  passphrase?: string;

  /** Whether this is a guest network (new API) */
  isGuest?: boolean;
}

// ============================================================================
// Internal/Normalized Types
// ============================================================================

/**
 * Normalized voucher format used internally and for Vorio sync.
 *
 * This format is controller-agnostic and represents vouchers
 * in a consistent way regardless of the source controller.
 *
 * @example
 * ```TypeScript
 * const voucher: MappedVoucher = {
 *   id: 'voucher_123',
 *   code: '12345-67890',
 *   duration: 1440,      // 24 hours in minutes
 *   quota: 1,            // single use
 *   createTime: 1705312200,
 *   used: 0,
 *   status: 'VALID_ONE'
 * };
 * ```
 */
export interface MappedVoucher {
  /** Unique voucher identifier (from controller) */
  id: string;

  /** Voucher code that users enter */
  code: string;

  /** Duration in minutes (undefined = unlimited) */
  duration?: number;

  /** Maximum number of uses (1 = single use) */
  quota: number;

  /** Creation timestamp (Unix timestamp in seconds) */
  createTime: number;

  /** First use timestamp (Unix timestamp in seconds) */
  startTime?: number;

  /** Number of times this voucher has been used */
  used: number;

  /**
   * Current voucher status.
   * - `VALID_ONE`: Valid, single use
   * - `VALID_MULTI`: Valid, multi-use
   * - `USED`: Used up
   * - `EXPIRED`: Expired
   */
  status: string;

  /** Upload bandwidth limit in kbps */
  qosRateMaxUp?: number;

  /** Download bandwidth limit in kbps */
  qosRateMaxDown?: number;

  /** Optional note/description */
  note?: string;
}

/**
 * Current agent status.
 *
 * Tracks the agent's connection state and sync statistics.
 */
export interface AgentStatus {
  /** Whether connected to Vorio Cloud */
  connected: boolean;

  /** Timestamp of last successful sync */
  lastSync?: Date;

  /** Last error message (if any) */
  lastError?: string;

  /** Total number of vouchers from last sync */
  voucherCount: number;
}

/**
 * Information about an available WLAN.
 *
 * Reported to Vorio Cloud so users can see which networks
 * are available on the controller.
 */
export interface AvailableWLAN {
  /** SSID (network name) */
  ssid: string;

  /** Human-readable name if different from SSID */
  name?: string;

  /** Whether the WLAN is enabled */
  enabled?: boolean;

  /**
   * Security mode.
   * - `open`: No security
   * - `wpa`: WPA
   * - `wpa2`: WPA2
   * - `wpa3`: WPA3
   */
  security?: string;

  /** Whether this is a guest network with captive portal */
  isGuest?: boolean;
}

/**
 * Capabilities supported by the controller adapter.
 *
 * Reported to Vorio Cloud so it knows what operations are available.
 */
export interface AgentCapabilities {
  /** Whether the adapter can list available WLANs */
  canListWLANs?: boolean;

  /** Whether the adapter can create new vouchers */
  canCreateVouchers?: boolean;

  /** Whether the adapter can delete vouchers */
  canDeleteVouchers?: boolean;
}

/**
 * Controller information returned by adapters.
 *
 * Provides basic information about the connected controller.
 */
export interface ControllerInfo {
  /** Controller software version */
  version: string;

  /** Controller name/hostname */
  name?: string;

  /** Controller type identifier */
  type: string;
}
