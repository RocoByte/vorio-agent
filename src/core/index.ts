/**
 * @fileoverview Core Module Exports
 *
 * This module re-exports all core functionality for convenient importing.
 * Core modules provide foundational services used throughout the application.
 *
 * ## Included Modules
 *
 * - **config**: Application configuration management
 * - **errors**: Custom error classes for structured error handling
 * - **logger**: Structured logging with levels and colored output
 *
 * ## Usage Example
 *
 * ```TypeScript
 * import {
 *   config,
 *   validateConfig,
 *   createLogger,
 *   VorioAgentError,
 *   ConnectionError
 * } from '@/core';
 *
 * const logger = createLogger('MyModule');
 * logger.info('Starting...', { host: config.unifi.host });
 * ```
 *
 * @module core
 * @author RocoByte
 * @license MIT
 */

// Configuration
export {
  config,
  validateConfig,
  validateConfigOrThrow,
  getRedactedConfig,
} from './config/index.js';
export type {
  AppConfig,
  ControllerType,
  UniFiConfig,
  MikroTikConfig,
  VorioConfig,
  SyncConfig,
  ValidationResult,
} from './config/index.js';

// Error classes
export {
  VorioAgentError,
  ConfigurationError,
  ControllerError,
  AuthenticationError,
  ConnectionError,
  VorioApiError,
  SyncError,
  isVorioAgentError,
  isConnectionError,
  isAuthenticationError,
  wrapError,
  getErrorMessage,
} from './errors/index.js';

// Logger
export {
  createLogger,
  configureLogger,
  getLoggerConfig,
  agentLogger,
  syncLogger,
  vorioLogger,
  formatErrorForUser,
  logConnectivityResult,
} from './logger/index.js';
export type { LogLevel, LoggerConfig, Logger, FormattedError } from './logger/index.js';
