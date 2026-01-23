/**
 * @fileoverview Vorio Cloud API Client
 *
 * This module handles all communication with the Vorio Cloud API.
 * It provides methods for connecting, syncing vouchers, handling commands,
 * and sending status updates.
 *
 * ## API Endpoints
 *
 * | Endpoint                          | Method | Description                    |
 * |-----------------------------------|--------|--------------------------------|
 * | `/api/agent/connect`              | POST   | Register agent with Vorio      |
 * | `/api/agent/sync`                 | POST   | Upload vouchers                |
 * | `/api/agent/commands`             | GET    | Get pending commands           |
 * | `/api/agent/commands/{id}/ack`    | POST   | Acknowledge command receipt    |
 * | `/api/agent/commands/{id}/complete`| POST  | Mark command as completed      |
 * | `/api/agent/heartbeat`            | POST   | Send status heartbeat          |
 * | `/api/agent/wlan-list`            | POST   | Update WLAN list               |
 * | `/api/agent/capabilities`         | POST   | Update capabilities            |
 * | `/api/agent/disconnect`           | POST   | Graceful disconnect            |
 *
 * ## Authentication
 *
 * All requests include the agent token in both:
 * - `Authorization: Bearer {token}` header
 * - `X-Agent-Token: {token}` header
 *
 * @module services/vorio-client
 * @author RocoByte
 * @license MIT
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../core/index.js';
import { createLogger, formatErrorForUser, logConnectivityResult } from '../core/index.js';
import { VorioApiError, ConnectionError } from '../core/index.js';
import {
  VorioConnectResponse,
  VorioSyncResponse,
  VorioCommandsResponse,
  VorioCommand,
  MappedVoucher,
  AvailableWLAN,
  AgentCapabilities,
} from '../types/index.js';

// ============================================================================
// Constants
// ============================================================================

/** Logger instance for this module */
const logger = createLogger('Vorio');

/** Agent version for User-Agent header */
const AGENT_VERSION = '1.0.0';

/** Default request timeout (30 seconds) */
const REQUEST_TIMEOUT = 30000;

// ============================================================================
// Vorio Client Implementation
// ============================================================================

/**
 * Vorio Cloud API Client.
 *
 * Handles all communication with the Vorio Cloud API, including
 * agent registration, voucher synchronization, and command processing.
 *
 * @example
 * ```TypeScript
 * const client = new VorioClient();
 *
 * // Connect to Vorio
 * await client.connect({
 *   controllerUrl: 'https://unifi.example.com',
 *   siteName: 'default',
 * });
 *
 * // Sync vouchers
 * await client.syncVouchers(vouchers);
 *
 * // Process commands
 * const commands = await client.getCommands();
 * ```
 */
export class VorioClient {
  /** HTTP client for API requests */
  private client: AxiosInstance;

  /** Connection ID from successful connect */
  private connectionId?: string;

  /** Project ID from successful connect */
  private projectId?: string;

  /**
   * Create a new Vorio client instance.
   */
  constructor() {
    this.client = this.createHttpClient();
  }

  /**
   * Create and configure the HTTP client.
   * @internal
   */
  private createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: config.vorio.apiUrl,
      timeout: REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.vorio.agentToken}`,
        'X-Agent-Token': config.vorio.agentToken,
        'User-Agent': `Vorio-Agent/${AGENT_VERSION}`,
      },
    });

    // Response interceptor for error handling
    client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleError(error)
    );

    return client;
  }

  /**
   * Handle HTTP errors with detailed logging.
   * @internal
   */
  private handleError(error: AxiosError): never {
    const formatted = formatErrorForUser(error);

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { error?: string; message?: string };
      const errorMessage = data?.error || data?.message || error.message;

      if (status === 401) {
        logger.error('Authentication failed - check your agent token');
        throw new VorioApiError(
          'Authentication failed. Please check your VORIO_AGENT_TOKEN.',
          status,
          error.config?.url
        );
      }

      if (status === 403) {
        logger.error('Access denied - agent token may not have required permissions');
        throw new VorioApiError(
          'Access denied. The agent token may not have the required permissions.',
          status,
          error.config?.url
        );
      }

      if (status === 404) {
        logger.error('Resource not found', { url: error.config?.url });
        throw new VorioApiError(
          'API endpoint not found. Please check the VORIO_API_URL.',
          status,
          error.config?.url
        );
      }

      if (status === 429) {
        logger.error('Rate limit exceeded');
        throw new VorioApiError(
          'Rate limit exceeded. Please reduce sync frequency.',
          status,
          error.config?.url
        );
      }

      logger.error(`API error (${status}): ${errorMessage}`, {
        url: error.config?.url,
      });

      throw new VorioApiError(errorMessage, status, error.config?.url);
    }

    if (error.request) {
      logger.error('No response received from Vorio API', {
        message: formatted.message,
      });

      if (formatted.suggestion) {
        logger.info(`Suggestion: ${formatted.suggestion}`);
      }

      throw new ConnectionError(
        'Could not connect to Vorio Cloud. Please check your network connection.',
        'vorio',
        config.vorio.apiUrl,
        undefined,
        (error as AxiosError).code
      );
    }

    logger.error('Request error', { message: error.message });
    throw new VorioApiError(error.message);
  }

  // ==========================================================================
  // Connection Methods
  // ==========================================================================

  /**
   * Test connectivity to Vorio Cloud API.
   *
   * @returns True if API is reachable
   * @throws ConnectionError if API is not reachable
   */
  async testConnectivity(): Promise<boolean> {
    logger.info('Testing connectivity to Vorio Cloud...');

    try {
      // Simple GET to check if API is reachable
      await this.client.get('/health', { timeout: 10000 });
      logConnectivityResult(true, 'Vorio Cloud API', config.vorio.apiUrl);
      return true;
    } catch (error) {
      // If it's a 404, the API is reachable but health endpoint doesn't exist
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        logConnectivityResult(true, 'Vorio Cloud API', config.vorio.apiUrl);
        return true;
      }

      logConnectivityResult(false, 'Vorio Cloud API', config.vorio.apiUrl, error);
      throw error;
    }
  }

  /**
   * Connect to Vorio Cloud and register the agent.
   *
   * This should be called once at startup. It registers the agent
   * with Vorio Cloud and receives connection/project IDs.
   *
   * @param controllerInfo - Information about the connected controller
   * @returns Connection response with IDs
   * @throws VorioApiError if connection fails
   */
  async connect(controllerInfo: {
    controllerUrl: string;
    controllerVersion?: string;
    siteName: string;
    capabilities?: AgentCapabilities;
    availableWLANs?: AvailableWLAN[];
  }): Promise<VorioConnectResponse> {
    logger.info('Connecting to Vorio Cloud...');

    const response = await this.client.post<VorioConnectResponse>(
      '/api/agent/connect',
      {
        controllerUrl: controllerInfo.controllerUrl,
        controllerVersion: controllerInfo.controllerVersion,
        siteName: controllerInfo.siteName,
        capabilities: controllerInfo.capabilities,
        availableWLANs: controllerInfo.availableWLANs,
      }
    );

    this.connectionId = response.data.connectionId;
    this.projectId = response.data.projectId;

    logger.info('Connected to Vorio Cloud', {
      connectionId: this.connectionId,
      projectId: this.projectId,
    });

    return response.data;
  }

  /**
   * Gracefully disconnect from Vorio Cloud.
   *
   * Notifies Vorio Cloud that the agent is shutting down.
   */
  async disconnect(): Promise<void> {
    logger.info('Disconnecting from Vorio Cloud...');

    try {
      await this.client.post('/api/agent/disconnect');
      logger.info('Disconnected from Vorio Cloud');
    } catch (error) {
      logger.warn('Failed to disconnect gracefully', {
        error: (error as Error).message,
      });
    }

    this.connectionId = undefined;
    this.projectId = undefined;
  }

  // ==========================================================================
  // Status Methods
  // ==========================================================================

  /**
   * Send a heartbeat to indicate the agent is alive.
   *
   * @param status - Current agent status
   */
  async heartbeat(status: {
    voucherCount?: number;
    status?: 'ok' | 'error';
    error?: string;
  }): Promise<void> {
    await this.client.post('/api/agent/heartbeat', status);
    logger.debug('Heartbeat sent', { status: status.status });
  }

  /**
   * Update the list of available WLANs.
   *
   * @param wlans - List of available WLANs
   */
  async updateWLANList(wlans: AvailableWLAN[]): Promise<void> {
    logger.info('Updating WLAN list', { count: wlans.length });
    await this.client.post('/api/agent/wlan-list', { wlans });
  }

  /**
   * Update agent capabilities.
   *
   * @param capabilities - Updated capabilities
   */
  async updateCapabilities(capabilities: AgentCapabilities): Promise<void> {
    logger.info('Updating capabilities');
    await this.client.post('/api/agent/capabilities', { capabilities });
  }

  // ==========================================================================
  // Voucher Sync Methods
  // ==========================================================================

  /**
   * Sync vouchers to Vorio Cloud.
   *
   * Uploads the current list of vouchers. This replaces the previous
   * list in Vorio Cloud with the new one.
   *
   * @param vouchers - Array of vouchers to sync
   * @returns Sync response with count
   */
  async syncVouchers(vouchers: MappedVoucher[]): Promise<VorioSyncResponse> {
    logger.info('Syncing vouchers to Vorio Cloud', { count: vouchers.length });

    const response = await this.client.post<VorioSyncResponse>(
      '/api/agent/sync',
      { vouchers }
    );

    logger.info('Vouchers synced successfully', {
      synced: response.data.syncedCount,
    });

    return response.data;
  }

  // ==========================================================================
  // Command Methods
  // ==========================================================================

  /**
   * Get pending commands from Vorio Cloud.
   *
   * Commands are instructions from Vorio Cloud telling the agent
   * to perform actions like syncing or deleting vouchers.
   *
   * @returns Array of pending commands
   */
  async getCommands(): Promise<VorioCommand[]> {
    const response = await this.client.get<VorioCommandsResponse>(
      '/api/agent/commands'
    );
    return response.data.commands;
  }

  /**
   * Acknowledge receipt of a command.
   *
   * Call this immediately after receiving a command to indicate
   * that the agent has received it and will process it.
   *
   * @param commandId - ID of the command to acknowledge
   */
  async acknowledgeCommand(commandId: string): Promise<void> {
    logger.debug('Acknowledging command', { commandId });
    await this.client.post(`/api/agent/commands/${commandId}/ack`);
  }

  /**
   * Mark a command as completed.
   *
   * Call this after processing a command to report the result.
   *
   * @param commandId - ID of the completed command
   * @param success - Whether the command was successful
   * @param error - Error message if command failed
   */
  async completeCommand(
    commandId: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    logger.debug('Completing command', { commandId, success });
    await this.client.post(`/api/agent/commands/${commandId}/complete`, {
      success,
      error,
    });
  }

  // ==========================================================================
  // Getter Methods
  // ==========================================================================

  /**
   * Get the connection ID (available after connect).
   */
  getConnectionId(): string | undefined {
    return this.connectionId;
  }

  /**
   * Get the project ID (available after connect).
   */
  getProjectId(): string | undefined {
    return this.projectId;
  }

  /**
   * Check if connected to Vorio Cloud.
   */
  isConnected(): boolean {
    return !!this.connectionId;
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

/** Singleton instance */
let instance: VorioClient | null = null;

/**
 * Get the singleton Vorio client instance.
 *
 * @returns Vorio client instance
 */
export function getVorioClient(): VorioClient {
  if (!instance) {
    instance = new VorioClient();
  }
  return instance;
}

/**
 * Reset the singleton instance.
 *
 * Useful for testing or reconfiguration.
 */
export function resetVorioClient(): void {
  instance = null;
}
