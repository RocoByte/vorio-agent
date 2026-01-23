/**
 * @fileoverview Synchronization Service
 *
 * This is the main orchestration service for the Vorio Agent.
 * It coordinates all activities between the controller adapter and Vorio Cloud:
 *
 * - Connecting to the controller and Vorio Cloud
 * - Periodically syncing vouchers
 * - Polling for and executing commands
 * - Sending heartbeats and status updates
 * - Graceful shutdown
 *
 * ## Lifecycle
 *
 * ```
 * start()
 *   ├── Login to controller
 *   ├── Get controller info, capabilities, WLANs
 *   ├── Connect to Vorio Cloud
 *   ├── Initial voucher sync
 *   ├── Start command poll loop (every 10s)
 *   └── Start sync loop (every 2min)
 *
 * Running...
 *   ├── Command loop: poll → process → complete
 *   └── Sync loop: fetch → upload → heartbeat
 *
 * stop()
 *   ├── Stop command loop
 *   ├── Stop sync loop
 *   ├── Disconnect from Vorio
 *   └── Logout from controller
 * ```
 *
 * @module services/sync-service
 * @author RocoByte
 * @license MIT
 */

import { config } from '../core/index.js';
import { createLogger, formatErrorForUser } from '../core/index.js';
import { getErrorMessage } from '../core/index.js';
import { getVorioClient, VorioClient } from './vorio-client.js';
import { getAdapter, ControllerAdapter } from '../adapters/index.js';
import { VorioCommand, AgentStatus } from '../types/index.js';

// ============================================================================
// Constants
// ============================================================================

/** Logger instance for this module */
const logger = createLogger('Sync');

// ============================================================================
// Sync Service Implementation
// ============================================================================

/**
 * Synchronization Service.
 *
 * Main orchestration service that coordinates the sync between
 * controller adapters and Vorio Cloud.
 *
 * @example
 * ```TypeScript
 * const service = getSyncService();
 *
 * // Start the service
 * await service.start();
 *
 * // Service is now running...
 * // - Polling for commands every 10 seconds
 * // - Syncing vouchers every 2 minutes
 *
 * // Stop gracefully
 * await service.stop();
 * ```
 */
export class SyncService {
  /** Vorio API client */
  private vorioClient: VorioClient;

  /** Controller adapter */
  private adapter: ControllerAdapter;

  /** Whether the service is running */
  private isRunning = false;

  /** Sync loop interval handle */
  private syncInterval?: NodeJS.Timeout;

  /** Command poll loop interval handle */
  private commandPollInterval?: NodeJS.Timeout;

  /** Current service status */
  private status: AgentStatus = {
    connected: false,
    voucherCount: 0,
  };

  /**
   * Create a new sync service instance.
   */
  constructor() {
    this.vorioClient = getVorioClient();
    this.adapter = getAdapter();
  }

  // ==========================================================================
  // Lifecycle Methods
  // ==========================================================================

  /**
   * Start the synchronization service.
   *
   * This method:
   * 1. Logs into the controller
   * 2. Fetches controller info and capabilities
   * 3. Connects to Vorio Cloud
   * 4. Performs initial voucher sync
   * 5. Starts the command poll and sync loops
   *
   * @throws Error if startup fails
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Service is already running');
      return;
    }

    logger.info('Starting sync service...');
    this.isRunning = true;

    try {
      // Step 1: Login to controller
      logger.info(`Using ${this.adapter.getType()} adapter`);
      await this.adapter.login();

      // Step 2: Get controller info
      const controllerInfo = await this.adapter.getControllerInfo();
      logger.info('Controller info', {
        type: controllerInfo.type,
        version: controllerInfo.version,
        name: controllerInfo.name,
      });

      // Step 3: Get capabilities and WLANs
      const capabilities = this.adapter.getCapabilities();
      let availableWLANs;
      if (capabilities.canListWLANs) {
        availableWLANs = await this.adapter.getAvailableWLANs();
      }

      // Step 4: Connect to Vorio Cloud
      await this.vorioClient.connect({
        controllerUrl: this.getControllerUrl(),
        controllerVersion: controllerInfo.version,
        siteName: this.getSiteName(),
        capabilities,
        availableWLANs,
      });

      this.status.connected = true;

      // Step 5: Initial sync
      await this.performSync();

      // Step 6: Start loops
      this.startCommandPollLoop();
      this.startSyncLoop();

      logger.info('Sync service started successfully');
    } catch (error) {
      logger.error('Failed to start sync service');
      this.logError(error);

      this.status.connected = false;
      this.status.lastError = getErrorMessage(error);
      this.isRunning = false;

      throw error;
    }
  }

  /**
   * Stop the synchronization service.
   *
   * Gracefully stops all loops and disconnects from services.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping sync service...');
    this.isRunning = false;

    // Stop command poll loop
    if (this.commandPollInterval) {
      clearInterval(this.commandPollInterval);
      this.commandPollInterval = undefined;
    }

    // Stop sync loop
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }

    // Disconnect from Vorio Cloud
    try {
      await this.vorioClient.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    // Logout from controller
    try {
      await this.adapter.logout();
    } catch {
      // Ignore logout errors
    }

    this.status.connected = false;
    logger.info('Sync service stopped');
  }

  // ==========================================================================
  // Loop Management
  // ==========================================================================

  /**
   * Start the command polling loop.
   *
   * Polls Vorio Cloud for pending commands at a fast interval (default 10s)
   * to ensure quick response to user actions.
   * @internal
   */
  private startCommandPollLoop(): void {
    const intervalMs = config.sync.commandPollIntervalMs;
    logger.info('Starting command poll loop', {
      intervalMs,
      intervalSec: intervalMs / 1000,
    });

    this.commandPollInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.processCommands();
      } catch (error) {
        logger.error('Command poll error');
        this.logError(error);
      }
    }, intervalMs);
  }

  /**
   * Start the sync loop.
   *
   * Periodically syncs vouchers and sends heartbeats (default 2 min).
   * @internal
   */
  private startSyncLoop(): void {
    const intervalMs = config.sync.intervalMs;
    logger.info('Starting sync loop', {
      intervalMs,
      intervalMin: intervalMs / 60000,
    });

    this.syncInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.syncCycle();
      } catch (error) {
        logger.error('Sync cycle error');
        this.logError(error);
        this.status.lastError = getErrorMessage(error);

        // Send error heartbeat
        try {
          await this.vorioClient.heartbeat({
            voucherCount: this.status.voucherCount,
            status: 'error',
            error: this.status.lastError,
          });
        } catch {
          // Ignore heartbeat errors
        }
      }
    }, intervalMs);
  }

  // ==========================================================================
  // Sync Operations
  // ==========================================================================

  /**
   * Perform a single sync cycle.
   *
   * Syncs vouchers and sends a heartbeat.
   * @internal
   */
  private async syncCycle(): Promise<void> {
    // Sync vouchers
    await this.performSync();

    // Send heartbeat
    await this.vorioClient.heartbeat({
      voucherCount: this.status.voucherCount,
      status: 'ok',
    });
  }

  /**
   * Perform a full voucher sync.
   *
   * Fetches vouchers from the controller and uploads them to Vorio Cloud.
   * @internal
   */
  private async performSync(): Promise<void> {
    logger.info('Starting voucher sync...');

    // Get vouchers from controller
    const vouchers = await this.adapter.getVouchers();

    // Sync to Vorio Cloud
    const result = await this.vorioClient.syncVouchers(vouchers);

    // Update status
    this.status.voucherCount = result.syncedCount;
    this.status.lastSync = new Date();
    this.status.lastError = undefined;

    logger.info('Voucher sync completed', {
      count: result.syncedCount,
    });
  }

  // ==========================================================================
  // Command Processing
  // ==========================================================================

  /**
   * Process pending commands from Vorio Cloud.
   * @internal
   */
  private async processCommands(): Promise<void> {
    logger.debug('Checking for pending commands...');
    const commands = await this.vorioClient.getCommands();

    if (commands.length === 0) {
      return;
    }

    logger.info('Processing commands', { count: commands.length });

    for (const command of commands) {
      await this.processCommand(command);
    }
  }

  /**
   * Process a single command.
   * @internal
   */
  private async processCommand(command: VorioCommand): Promise<void> {
    logger.info('Processing command', {
      type: command.type,
      id: command.id,
    });

    // Acknowledge the command
    await this.vorioClient.acknowledgeCommand(command.id);

    try {
      switch (command.type) {
        case 'sync_now':
          await this.handleSyncNowCommand();
          break;

        case 'delete_voucher':
          await this.handleDeleteVoucherCommand(command);
          break;

        case 'disconnect':
          await this.handleDisconnectCommand();
          return; // Don't complete the command if stopping

        default:
          logger.warn('Unknown command type', { type: command.type });
      }

      // Mark command as completed
      await this.vorioClient.completeCommand(command.id, true);
    } catch (error) {
      logger.error('Command failed', {
        type: command.type,
        id: command.id,
      });
      this.logError(error);

      await this.vorioClient.completeCommand(
        command.id,
        false,
        getErrorMessage(error)
      );
    }
  }

  /**
   * Handle sync_now command.
   * @internal
   */
  private async handleSyncNowCommand(): Promise<void> {
    logger.info('Executing sync_now command');
    await this.performSync();
  }

  /**
   * Handle delete_voucher command.
   * @internal
   */
  private async handleDeleteVoucherCommand(command: VorioCommand): Promise<void> {
    const payload = command.payload as {
      voucherId?: string;
      voucherCode?: string;
    };

    logger.info('Executing delete_voucher command', {
      voucherId: payload?.voucherId,
      voucherCode: payload?.voucherCode,
    });

    if (payload?.voucherId) {
      // Delete by ID
      await this.adapter.deleteVoucher(payload.voucherId);
    } else if (payload?.voucherCode) {
      // Find voucher by code and delete
      const vouchers = await this.adapter.getVouchers();
      const voucher = vouchers.find((v) => v.code === payload.voucherCode);

      if (voucher) {
        await this.adapter.deleteVoucher(voucher.id);
      } else {
        logger.warn('Voucher not found', { code: payload.voucherCode });
      }
    } else {
      logger.warn('Delete command missing voucherId and voucherCode');
    }
  }

  /**
   * Handle disconnect command.
   * @internal
   */
  private async handleDisconnectCommand(): Promise<void> {
    logger.info('Received disconnect command');
    await this.stop();
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Log an error with formatted details.
   * @internal
   */
  private logError(error: unknown): void {
    const formatted = formatErrorForUser(error);
    logger.error(formatted.message, formatted.details);
    if (formatted.suggestion) {
      logger.info(`Suggestion: ${formatted.suggestion}`);
    }
  }

  /**
   * Get the controller URL based on adapter type.
   * @internal
   */
  private getControllerUrl(): string {
    switch (config.controllerType) {
      case 'unifi':
        return config.unifiBaseUrl;
      case 'mikrotik':
        return config.mikrotikBaseUrl;
      default:
        return 'unknown';
    }
  }

  /**
   * Get the site name based on adapter type.
   * @internal
   */
  private getSiteName(): string {
    switch (config.controllerType) {
      case 'unifi':
        return config.unifi.site;
      default:
        return 'default';
    }
  }

  // ==========================================================================
  // Status Methods
  // ==========================================================================

  /**
   * Get current service status.
   *
   * @returns Copy of current status
   */
  getStatus(): AgentStatus {
    return { ...this.status };
  }

  /**
   * Check if service is running.
   *
   * @returns True if running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

/** Singleton instance */
let instance: SyncService | null = null;

/**
 * Get the singleton sync service instance.
 *
 * @returns Sync service instance
 */
export function getSyncService(): SyncService {
  if (!instance) {
    instance = new SyncService();
  }
  return instance;
}

/**
 * Reset the singleton instance.
 *
 * Useful for testing or reconfiguration.
 */
export function resetSyncService(): void {
  instance = null;
}
