/**
 * @fileoverview Structured Logger for Vorio Agent
 *
 * Provides a consistent, configurable logging system with:
 * - Log levels (debug, info, warn, error)
 * - Clean, professional output format
 * - Structured context data for debugging
 * - Module prefixes for log source tracing
 *
 * ## Configuration via Environment Variables
 *
 * - `LOG_LEVEL`: Minimum log level (debug, info, warn, error). Default: 'info'
 * - `LOG_FORMAT`: Output format ('text' or 'json'). Default: 'text'
 *
 * @module core/logger
 * @author RocoByte
 * @license MIT
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Available log levels in order of verbosity (least to most verbose).
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Configuration options for the logger.
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Whether to output in JSON format */
  json: boolean;
}

/**
 * Logger instance interface.
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(subModule: string): Logger;
}

// ============================================================================
// Configuration
// ============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let globalConfig: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  json: process.env.LOG_FORMAT === 'json',
};

/**
 * Configure the global logger settings.
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get the current logger configuration.
 */
export function getLoggerConfig(): LoggerConfig {
  return { ...globalConfig };
}

// ============================================================================
// Formatting
// ============================================================================

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[globalConfig.level];
}

function formatContext(context: Record<string, unknown>): string {
  const pairs = Object.entries(context)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `${key}=${valueStr}`;
    });

  return pairs.length > 0 ? pairs.join(' ') : '';
}

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

function formatTextMessage(
  level: LogLevel,
  module: string,
  message: string,
  context?: Record<string, unknown>
): string {
  const timestamp = getTimestamp();
  const levelUpper = level.toUpperCase().padEnd(5);
  const contextStr = context && Object.keys(context).length > 0 ? ` ${formatContext(context)}` : '';

  return `${timestamp} ${levelUpper} [${module}] ${message}${contextStr}`;
}

function formatJsonMessage(
  level: LogLevel,
  module: string,
  message: string,
  context?: Record<string, unknown>
): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...(context && Object.keys(context).length > 0 && { context }),
  });
}

function formatMessage(
  level: LogLevel,
  module: string,
  message: string,
  context?: Record<string, unknown>
): string {
  if (globalConfig.json) {
    return formatJsonMessage(level, module, message, context);
  }
  return formatTextMessage(level, module, message, context);
}

// ============================================================================
// Logger Factory
// ============================================================================

/**
 * Create a logger instance for a specific module.
 *
 * @param module - Module name to use as prefix
 * @returns Logger instance
 *
 * @example
 * ```typescript
 * const logger = createLogger('UniFi');
 * logger.info('Connected to controller');
 * // Output: 2024-01-15 10:30:45 INFO  [UniFi] Connected to controller
 * ```
 */
export function createLogger(module: string): Logger {
  return {
    debug(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('debug')) {
        console.debug(formatMessage('debug', module, message, context));
      }
    },

    info(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('info')) {
        console.info(formatMessage('info', module, message, context));
      }
    },

    warn(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', module, message, context));
      }
    },

    error(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('error')) {
        console.error(formatMessage('error', module, message, context));
      }
    },

    child(subModule: string): Logger {
      return createLogger(`${module}:${subModule}`);
    },
  };
}

// ============================================================================
// Pre-configured Module Loggers
// ============================================================================

export const agentLogger = createLogger('Agent');
export const syncLogger = createLogger('Sync');
export const vorioLogger = createLogger('Vorio');

// ============================================================================
// Error Formatting
// ============================================================================

export interface FormattedError {
  message: string;
  details: Record<string, unknown>;
  suggestion?: string;
}

/**
 * Format an error for user-friendly display.
 */
export function formatErrorForUser(error: unknown): FormattedError {
  interface AxiosLikeError extends Error {
    code?: string;
    response?: { status?: number; data?: unknown };
    config?: { url?: string; baseURL?: string };
  }

  if (error instanceof Error) {
    const axiosError = error as AxiosLikeError;

    if (axiosError.code === 'ECONNREFUSED') {
      return {
        message: 'Connection refused - Controller is not reachable',
        details: { code: axiosError.code },
        suggestion: 'Check if the controller is running and the host/port are correct.',
      };
    }

    if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
      return {
        message: 'Connection timed out',
        details: { code: axiosError.code },
        suggestion: 'Check network connectivity and firewall settings.',
      };
    }

    if (axiosError.code === 'ENOTFOUND') {
      return {
        message: 'Host not found - DNS resolution failed',
        details: { code: axiosError.code },
        suggestion: 'Check that the hostname is spelled correctly.',
      };
    }

    if (
      axiosError.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      axiosError.code === 'CERT_HAS_EXPIRED' ||
      axiosError.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
      error.message.includes('certificate')
    ) {
      return {
        message: 'SSL certificate verification failed',
        details: { code: axiosError.code },
        suggestion: 'Set UNIFI_SKIP_SSL_VERIFY=true for self-signed certificates.',
      };
    }

    if (axiosError.response?.status) {
      const status = axiosError.response.status;
      const messages: Record<number, { msg: string; hint: string }> = {
        401: { msg: 'Authentication failed', hint: 'Check your API key or credentials.' },
        403: { msg: 'Access denied', hint: 'Check permissions for your API key or user.' },
        404: { msg: 'Resource not found', hint: 'Check controller version compatibility.' },
        429: { msg: 'Rate limit exceeded', hint: 'Reduce sync frequency.' },
        500: { msg: 'Controller internal error', hint: 'Check controller logs.' },
        503: { msg: 'Service unavailable', hint: 'Controller may be restarting.' },
      };

      const info = messages[status] || { msg: `HTTP error ${status}`, hint: 'Check controller logs.' };
      return {
        message: info.msg,
        details: { status },
        suggestion: info.hint,
      };
    }

    return { message: error.message, details: { name: error.name } };
  }

  return { message: String(error), details: {} };
}

/**
 * Log connectivity test result.
 */
export function logConnectivityResult(
  success: boolean,
  target: string,
  host: string,
  error?: unknown
): void {
  const logger = createLogger('Network');

  if (success) {
    logger.info(`${target} is reachable`, { host });
  } else {
    const formatted = formatErrorForUser(error);
    logger.error(`Cannot reach ${target}: ${formatted.message}`, { host });
    if (formatted.suggestion) {
      logger.info(`Hint: ${formatted.suggestion}`);
    }
  }
}
