/**
 * @fileoverview Vorio Agent - Entry Point
 *
 * Main entry point for the Vorio Agent application.
 *
 * @module index
 * @author RocoByte
 * @license MIT
 */

import {
  config,
  validateConfig,
  ControllerType,
  agentLogger as logger,
} from './core/index.js';
import { getSyncService } from './services/index.js';

// ============================================================================
// Constants
// ============================================================================

const VERSION = '1.0.0';

const CONTROLLER_LABELS: Record<ControllerType, string> = {
  unifi: 'UniFi',
  mikrotik: 'MikroTik',
  openwrt: 'OpenWRT',
  custom: 'Custom',
};

// ============================================================================
// Startup Functions
// ============================================================================

function printBanner(): void {
  console.log('');
  console.log('  Vorio Agent v' + VERSION);
  console.log('');
}

function printConfig(): void {
  const controllerLabel = CONTROLLER_LABELS[config.controllerType];

  logger.info('Configuration loaded');

  if (config.controllerType === 'unifi') {
    logger.info('Controller', {
      type: controllerLabel,
      host: config.unifi.host,
      port: config.unifi.port,
      site: config.unifi.site,
      auth: config.unifi.apiKey ? 'API Key' : 'Credentials',
    });
  } else {
    logger.info('Controller', { type: controllerLabel });
  }

  logger.info('Sync settings', {
    interval: `${config.sync.intervalMs / 1000}s`,
    commandPoll: `${config.sync.commandPollIntervalMs / 1000}s`,
  });
}

function validateAndWarn(): void {
  const result = validateConfig();

  if (!result.valid) {
    logger.error('Configuration errors:');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      logger.warn(warning);
    }
  }
}

// ============================================================================
// Shutdown Handling
// ============================================================================

async function shutdown(signal: string): Promise<void> {
  console.log('');
  logger.info('Shutting down', { signal });

  try {
    const syncService = getSyncService();
    await syncService.stop();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

function setupSignalHandlers(): void {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    shutdown('unhandledRejection');
  });
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  printBanner();
  validateAndWarn();
  printConfig();
  setupSignalHandlers();

  const syncService = getSyncService();

  try {
    await syncService.start();
  } catch (error) {
    logger.error('Failed to start agent', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Fatal error', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
