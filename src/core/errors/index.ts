/**
 * @fileoverview Custom Error Classes for Vorio Agent
 *
 * This module provides a hierarchy of custom error classes for better error handling
 * and debugging throughout the application. Each error class captures context-specific
 * information that helps identify and resolve issues quickly.
 *
 * ## Error Hierarchy
 *
 * ```
 * VorioAgentError (base class)
 * ├── ConfigurationError     - Invalid or missing configuration
 * ├── ControllerError        - Controller communication issues
 * │   ├── AuthenticationError  - Login/auth failures
 * │   └── ConnectionError      - Network/connectivity issues
 * ├── VorioApiError          - Vorio Cloud API issues
 * └── SyncError              - Synchronization failures
 * ```
 *
 * ## Usage Example
 *
 * ```TypeScript
 * import { AuthenticationError, isVorioAgentError } from '@/core/errors';
 *
 * try {
 *   await controller.login();
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     logger.error('Check your credentials');
 *   }
 * }
 * ```
 *
 * @module core/errors
 * @author RocoByte
 * @license MIT
 */

// ============================================================================
// Base Error
// ============================================================================

/**
 * Base error class for all Vorio Agent errors.
 *
 * Extends the native Error class with additional context information
 * such as error codes and metadata. All custom errors in the application
 * should extend this class for consistent error handling.
 *
 * @example
 * ```TypeScript
 * throw new VorioAgentError('Something went wrong', 'GENERIC_ERROR', {
 *   detail: 'Additional info for debugging'
 * });
 * ```
 */
export class VorioAgentError extends Error {
  /**
   * Unique error code for programmatic error identification.
   * Format: CATEGORY_SPECIFIC_ERROR (e.g., AUTH_INVALID_TOKEN)
   */
  public code: string;

  /**
   * Additional context information about the error.
   * Can include request IDs, timestamps, or other debugging info.
   */
  public readonly context?: Record<string, unknown>;

  /**
   * ISO timestamp when the error occurred.
   */
  public readonly timestamp: string;

  /**
   * Creates a new VorioAgentError instance.
   *
   * @param message - Human-readable error description
   * @param code - Unique error code for identification (default: 'AGENT_ERROR')
   * @param context - Optional additional context data for debugging
   */
  constructor(
    message: string,
    code = 'AGENT_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VorioAgentError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a JSON-serializable representation of the error.
   * Useful for logging, API responses, and structured error reporting.
   *
   * @returns Object containing all error information
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

/**
 * Error thrown when configuration is invalid or missing.
 *
 * This error is thrown during application startup when required
 * environment variables are missing or have invalid values.
 * It helps users quickly identify configuration problems.
 *
 * @example
 * ```TypeScript
 * if (!process.env.VORIO_API_URL) {
 *   throw new ConfigurationError(
 *     'VORIO_API_URL is required',
 *     'VORIO_API_URL'
 *   );
 * }
 * ```
 */
export class ConfigurationError extends VorioAgentError {
  /** The name of the configuration variable that caused the error */
  public readonly variableName?: string;

  /**
   * Creates a new ConfigurationError.
   *
   * @param message - Description of the configuration problem
   * @param variableName - Name of the problematic config variable
   * @param context - Additional context information
   */
  constructor(
    message: string,
    variableName?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'CONFIG_ERROR', { ...context, variableName });
    this.name = 'ConfigurationError';
    this.variableName = variableName;
  }
}

// ============================================================================
// Controller Errors
// ============================================================================

/**
 * Base error for controller-related issues.
 *
 * This error class represents problems with the WiFi controller
 * (UniFi, MikroTik, etc.) such as API errors or unexpected responses.
 * Specific controller errors should extend this class.
 *
 * @example
 * ```TypeScript
 * throw new ControllerError(
 *   'Failed to fetch vouchers',
 *   'unifi',
 *   { statusCode: 500, endpoint: '/api/vouchers' }
 * );
 * ```
 */
export class ControllerError extends VorioAgentError {
  /** The type of controller that caused the error (unifi, mikrotik, etc.) */
  public readonly controllerType: string;

  /**
   * Creates a new ControllerError.
   *
   * @param message - Description of the controller problem
   * @param controllerType - Type of controller (unifi, mikrotik, etc.)
   * @param context - Additional context information
   */
  constructor(
    message: string,
    controllerType: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'CONTROLLER_ERROR', { ...context, controllerType });
    this.name = 'ControllerError';
    this.controllerType = controllerType;
  }
}

/**
 * Error thrown when authentication with the controller fails.
 *
 * This includes invalid credentials, expired API keys, or
 * insufficient permissions. The error provides information
 * about which authentication method was used.
 *
 * @example
 * ```TypeScript
 * throw new AuthenticationError(
 *   'API key is invalid or expired',
 *   'unifi',
 *   'api_key'
 * );
 * ```
 */
export class AuthenticationError extends ControllerError {
  /** The authentication method that failed */
  public readonly authMethod: 'api_key' | 'credentials' | 'session' | 'unknown';

  /**
   * Creates a new AuthenticationError.
   *
   * @param message - Description of the authentication failure
   * @param controllerType - Type of controller
   * @param authMethod - The authentication method that was used
   * @param context - Additional context information
   */
  constructor(
    message: string,
    controllerType: string,
    authMethod: 'api_key' | 'credentials' | 'session' | 'unknown' = 'unknown',
    context?: Record<string, unknown>
  ) {
    super(message, controllerType, { ...context, authMethod });
    this.name = 'AuthenticationError';
    this.code = 'AUTH_ERROR';
    this.authMethod = authMethod;
  }
}

/**
 * Error thrown when connection to the controller fails.
 *
 * This includes network timeouts, DNS resolution failures,
 * SSL/TLS errors, and unreachable hosts. The error provides
 * detailed connection information for troubleshooting.
 *
 * @example
 * ```TypeScript
 * throw new ConnectionError(
 *   'Connection timed out after 30 seconds',
 *   'unifi',
 *   '192.168.1.1',
 *   443
 * );
 * ```
 */
export class ConnectionError extends ControllerError {
  /** The host that could not be reached */
  public readonly host?: string;

  /** The port that was used for the connection */
  public readonly port?: number;

  /** The underlying error code (e.g., ECONNREFUSED, ETIMEDOUT) */
  public readonly errorCode?: string;

  /**
   * Creates a new ConnectionError.
   *
   * @param message - Description of the connection failure
   * @param controllerType - Type of controller
   * @param host - The host that was being connected to
   * @param port - The port being used
   * @param errorCode - The underlying system error code
   * @param context - Additional context information
   */
  constructor(
    message: string,
    controllerType: string,
    host?: string,
    port?: number,
    errorCode?: string,
    context?: Record<string, unknown>
  ) {
    super(message, controllerType, { ...context, host, port, errorCode });
    this.name = 'ConnectionError';
    this.code = 'CONNECTION_ERROR';
    this.host = host;
    this.port = port;
    this.errorCode = errorCode;
  }
}

// ============================================================================
// Vorio API Errors
// ============================================================================

/**
 * Error thrown when communication with Vorio Cloud API fails.
 *
 * This includes API errors, rate limiting, authentication failures,
 * and network issues when communicating with Vorio Cloud.
 *
 * @example
 * ```TypeScript
 * throw new VorioApiError(
 *   'Rate limit exceeded - too many requests',
 *   429,
 *   '/api/agent/sync'
 * );
 * ```
 */
export class VorioApiError extends VorioAgentError {
  /** HTTP status code from the API response */
  public readonly statusCode?: number;

  /** The API endpoint that was called */
  public readonly endpoint?: string;

  /** Request ID from Vorio for support reference */
  public readonly requestId?: string;

  /**
   * Creates a new VorioApiError.
   *
   * @param message - Description of the API error
   * @param statusCode - HTTP status code
   * @param endpoint - The API endpoint that was called
   * @param requestId - Request ID for support reference
   * @param context - Additional context information
   */
  constructor(
    message: string,
    statusCode?: number,
    endpoint?: string,
    requestId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'VORIO_API_ERROR', {
      ...context,
      statusCode,
      endpoint,
      requestId,
    });
    this.name = 'VorioApiError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.requestId = requestId;
  }
}

// ============================================================================
// Sync Errors
// ============================================================================

/**
 * Error thrown when voucher synchronization fails.
 *
 * This error indicates a problem during the sync process,
 * which could be due to data transformation issues, partial
 * sync failures, or state inconsistencies.
 *
 * @example
 * ```TypeScript
 * throw new SyncError(
 *   'Failed to map voucher data: invalid date format',
 *   100,  // total vouchers
 *   50    // successfully synced
 * );
 * ```
 */
export class SyncError extends VorioAgentError {
  /** Total number of vouchers that were attempted to sync */
  public readonly totalVouchers?: number;

  /** Number of vouchers that were successfully synced */
  public readonly syncedVouchers?: number;

  /**
   * Creates a new SyncError.
   *
   * @param message - Description of the sync failure
   * @param totalVouchers - Total vouchers attempted
   * @param syncedVouchers - Vouchers successfully synced
   * @param context - Additional context information
   */
  constructor(
    message: string,
    totalVouchers?: number,
    syncedVouchers?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'SYNC_ERROR', { ...context, totalVouchers, syncedVouchers });
    this.name = 'SyncError';
    this.totalVouchers = totalVouchers;
    this.syncedVouchers = syncedVouchers;
  }
}

// ============================================================================
// Type Guards & Utilities
// ============================================================================

/**
 * Type guard to check if an error is a VorioAgentError.
 *
 * Use this function to safely narrow error types in catch blocks.
 *
 * @param error - The error to check
 * @returns True if the error is a VorioAgentError instance
 *
 * @example
 * ```TypeScript
 * try {
 *   await doSomething();
 * } catch (error) {
 *   if (isVorioAgentError(error)) {
 *     console.log(error.code);  // TypeScript knows error.code exists
 *   }
 * }
 * ```
 */
export function isVorioAgentError(error: unknown): error is VorioAgentError {
  return error instanceof VorioAgentError;
}

/**
 * Type guard to check if an error is a ConnectionError.
 *
 * @param error - The error to check
 * @returns True if the error is a ConnectionError instance
 */
export function isConnectionError(error: unknown): error is ConnectionError {
  return error instanceof ConnectionError;
}

/**
 * Type guard to check if an error is an AuthenticationError.
 *
 * @param error - The error to check
 * @returns True if the error is an AuthenticationError instance
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Wraps an unknown error into a VorioAgentError.
 *
 * This utility function ensures consistent error handling by wrapping
 * any unknown error types into a VorioAgentError instance. Original
 * error information is preserved in the context.
 *
 * @param error - The error to wrap
 * @param defaultMessage - Default message if error has none
 * @returns A VorioAgentError instance
 *
 * @example
 * ```TypeScript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   throw wrapError(error, 'Risky operation failed');
 * }
 * ```
 */
export function wrapError(
  error: unknown,
  defaultMessage = 'An unexpected error occurred'
): VorioAgentError {
  // Already a VorioAgentError - return as-is
  if (error instanceof VorioAgentError) {
    return error;
  }

  // Standard Error - preserve message and stack
  if (error instanceof Error) {
    return new VorioAgentError(error.message, 'WRAPPED_ERROR', {
      originalName: error.name,
      originalStack: error.stack,
    });
  }

  // String error
  if (typeof error === 'string') {
    return new VorioAgentError(error, 'WRAPPED_ERROR');
  }

  // Unknown error type
  return new VorioAgentError(defaultMessage, 'UNKNOWN_ERROR', {
    originalError: String(error),
  });
}

/**
 * Extract a user-friendly message from any error.
 *
 * This function attempts to extract the most useful error message
 * for display to users, handling various error formats.
 *
 * @param error - The error to extract message from
 * @returns A user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}
