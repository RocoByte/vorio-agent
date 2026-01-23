/**
 * @fileoverview UniFi Controller Adapter
 *
 * This adapter enables the Vorio Agent to communicate with Ubiquiti UniFi
 * controllers for voucher management. It supports both authentication methods:
 *
 * ## Authentication Methods
 *
 * ### 1. API Key Authentication (Recommended)
 * - For UniFi Network Application 8.0+
 * - Uses `X-API-KEY` header
 * - Stateless, no session management needed
 * - Set `UNIFI_API_KEY` environment variable
 *
 * ### 2. Username/Password Authentication (Legacy)
 * - For older UniFi controllers
 * - Session-based with cookies and CSRF tokens
 * - Set `UNIFI_USERNAME` and `UNIFI_PASSWORD` environment variables
 *
 * ## Supported Features
 *
 * - Fetch all vouchers (with pagination support)
 * - Delete vouchers
 * - List available WLANs
 * - Automatic session renewal on expiration
 *
 * ## API Endpoints Used
 *
 * ### New API (Integration API)
 * - `GET /proxy/network/integration/v1/sites` - List sites
 * - `GET /proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers` - Get vouchers
 * - `DELETE /proxy/network/integration/v1/sites/{siteId}/hotspot/vouchers/{id}` - Delete voucher
 *
 * ### Legacy API
 * - `POST /api/auth/login` or `/api/login` - Authenticate
 * - `GET /api/s/{site}/stat/voucher` - Get vouchers
 * - `POST /api/s/{site}/cmd/hotspot` - Commands (delete)
 * - `GET /api/s/{site}/rest/wlanconf` - Get WLANs
 *
 * @module adapters/unifi
 * @author RocoByte
 * @license MIT
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'https';
import { config } from '../core/config/index.js';
import {
  createLogger,
  formatErrorForUser,
  logConnectivityResult,
} from '../core/logger/index.js';
import {
  AuthenticationError,
  ConnectionError,
  ControllerError,
} from '../core/errors/index.js';
import {
  UniFiVoucher,
  UniFiLoginResponse,
  UniFiWLAN,
  MappedVoucher,
  AvailableWLAN,
  AgentCapabilities,
  ControllerInfo,
} from '../types/index.js';
import { ControllerAdapter } from './base.js';

// ============================================================================
// Logger
// ============================================================================

const logger = createLogger('UniFi');

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for API requests (30 seconds) */
const REQUEST_TIMEOUT = 30000;

/** API base path for new Integration API */
const API_BASE_PATH = '/proxy/network/integration/v1';

/** Maximum vouchers to fetch per page */
const VOUCHER_PAGE_SIZE = 1000;

// ============================================================================
// UniFi Adapter Implementation
// ============================================================================

/**
 * UniFi Controller Adapter.
 *
 * Implements the ControllerAdapter interface for UniFi controllers.
 * Supports both API key and username/password authentication.
 *
 * @example
 * ```TypeScript
 * const adapter = new UniFiAdapter();
 * await adapter.login();
 *
 * const vouchers = await adapter.getVouchers();
 * console.log(`Found ${vouchers.length} vouchers`);
 *
 * await adapter.logout();
 * ```
 */
export class UniFiAdapter implements ControllerAdapter {
  /** HTTP client for API requests */
  private client: AxiosInstance;

  /** Whether currently logged in */
  private isLoggedIn = false;

  /** Session cookies (for legacy auth) */
  private cookies: string[] = [];

  /** CSRF token (for legacy auth) */
  private csrfToken?: string;

  /** Controller software version */
  private controllerVersion?: string;

  /** Whether using API key authentication */
  private readonly useApiKey: boolean;

  /** Site ID (for new API) */
  private siteId?: string;

  /**
   * Create a new UniFi adapter instance.
   *
   * The adapter automatically detects which authentication method to use
   * based on the configuration (API key vs username/password).
   */
  constructor() {
    // Determine auth method based on config
    this.useApiKey = !!config.unifi.apiKey;

    logger.debug('Initializing adapter', {
      authMethod: this.useApiKey ? 'api_key' : 'credentials',
      host: config.unifi.host,
      port: config.unifi.port,
      site: config.unifi.site,
    });

    // Create HTTP client
    this.client = this.createHttpClient();
  }

  /**
   * Create and configure the HTTP client.
   * @internal
   */
  private createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: config.unifiBaseUrl,
      timeout: REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Add API key header if configured
        ...(this.useApiKey && { 'X-API-KEY': config.unifi.apiKey }),
      },
      // SSL configuration
      httpsAgent: new https.Agent({
        rejectUnauthorized: !config.unifi.skipSslVerify,
      }),
      // Don't follow redirects automatically (we handle auth redirects)
      maxRedirects: 0,
      // Accept 302 redirects without throwing
      validateStatus: (status) => status < 400 || status === 302,
    });

    // Add request interceptor for session auth
    if (!this.useApiKey) {
      client.interceptors.request.use((requestConfig) => {
        // Add session cookies
        if (this.cookies.length > 0) {
          requestConfig.headers['Cookie'] = this.cookies.join('; ');
        }
        // Add CSRF token
        if (this.csrfToken) {
          requestConfig.headers['X-Csrf-Token'] = this.csrfToken;
        }
        return requestConfig;
      });

      // Add response interceptor to capture cookies and CSRF token
      client.interceptors.response.use((response) => {
        // Store cookies from Set-Cookie header
        const setCookies = response.headers['set-cookie'];
        if (setCookies) {
          this.cookies = setCookies
            .map((cookie: string) => cookie.split(';')[0])
            .filter((cookie): cookie is string => cookie !== undefined);
        }
        // Store CSRF token if present
        const csrfToken = response.headers['x-csrf-token'];
        if (csrfToken) {
          this.csrfToken = csrfToken;
        }
        return response;
      });
    }

    return client;
  }

  // ==========================================================================
  // Connection Testing
  // ==========================================================================

  /**
   * Test connectivity to the UniFi controller.
   *
   * This method attempts a basic connection to verify the controller
   * is reachable before attempting authentication.
   *
   * @returns True if controller is reachable
   * @throws ConnectionError if controller is not reachable
   */
  async testConnectivity(): Promise<boolean> {
    logger.info('Testing connectivity to controller...', {
      host: config.unifi.host,
      port: config.unifi.port,
    });

    try {
      // Try a simple GET request to see if the host responds
      // We use a short timeout for the connectivity test
      const testClient = axios.create({
        baseURL: config.unifiBaseUrl,
        timeout: 10000, // 10 second timeout for connectivity test
        httpsAgent: new https.Agent({
          rejectUnauthorized: !config.unifi.skipSslVerify,
        }),
        validateStatus: () => true, // Accept any status, we just want to know if it responds
      });

      await testClient.get('/');

      logConnectivityResult(true, 'UniFi Controller', config.unifi.host);
      return true;
    } catch (error) {
      logConnectivityResult(false, 'UniFi Controller', config.unifi.host, error);

      // Throw a detailed connection error
      const axiosError = error as AxiosError;
      const errorCode = axiosError.code || 'UNKNOWN';

      throw new ConnectionError(
        this.getConnectionErrorMessage(errorCode),
        'unifi',
        config.unifi.host,
        config.unifi.port,
        errorCode
      );
    }
  }

  /**
   * Get a user-friendly error message for connection errors.
   * @internal
   */
  private getConnectionErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'ECONNREFUSED':
        return `Connection refused. The UniFi Controller at ${config.unifi.host}:${config.unifi.port} is not accepting connections. ` +
          'Please verify the controller is running and the host/port are correct.';

      case 'ETIMEDOUT':
      case 'ECONNABORTED':
        return `Connection timed out. The UniFi Controller at ${config.unifi.host}:${config.unifi.port} did not respond. ` +
          'Please check network connectivity and firewall settings.';

      case 'ENOTFOUND':
        return `Host not found. Could not resolve hostname '${config.unifi.host}'. ` +
          'Please check the hostname is spelled correctly.';

      case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      case 'CERT_HAS_EXPIRED':
        return `SSL/TLS certificate error when connecting to ${config.unifi.host}. ` +
          'Set UNIFI_SKIP_SSL_VERIFY=true if using a self-signed certificate.';

      default:
        return `Could not connect to UniFi Controller at ${config.unifi.host}:${config.unifi.port}. ` +
          `Error: ${errorCode}`;
    }
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  /**
   * Login to the UniFi Controller.
   *
   * For API key auth, this validates the key and fetches site information.
   * For legacy auth, this establishes a session with the controller.
   *
   * @throws ConnectionError if controller is not reachable
   * @throws AuthenticationError if authentication fails
   */
  async login(): Promise<void> {
    logger.info('Connecting to UniFi Controller...', {
      host: config.unifi.host,
      port: config.unifi.port,
    });

    // First, test connectivity
    await this.testConnectivity();

    // Then attempt authentication
    if (this.useApiKey) {
      await this.loginWithApiKey();
    } else {
      await this.loginWithCredentials();
    }
  }

  /**
   * Authenticate using API key (new Integration API).
   * @internal
   */
  private async loginWithApiKey(): Promise<void> {
    logger.info('Authenticating with API key...');

    try {
      // Get sites to validate API key and find site ID
      const response = await this.client.get(`${API_BASE_PATH}/sites`);

      if (response.status !== 200 || !response.data) {
        throw new AuthenticationError(
          'Failed to fetch sites - invalid API response',
          'unifi',
          'api_key'
        );
      }

      const sites = response.data.data || response.data;

      if (!Array.isArray(sites) || sites.length === 0) {
        throw new AuthenticationError(
          'No sites found. Please check API key permissions.',
          'unifi',
          'api_key'
        );
      }

      // Find the configured site or use the first one
      const targetSite = config.unifi.site || 'default';
      const site = sites.find(
        (s: { name?: string; desc?: string; id?: string }) =>
          s.name === targetSite || s.desc === targetSite || s.id === targetSite
      ) || sites[0];

      this.siteId = site.id;
      this.isLoggedIn = true;

      logger.info('Authentication successful', {
        siteName: site.name || site.desc,
        siteId: this.siteId,
      });
    } catch (error) {
      this.handleAuthError(error, 'api_key');
    }
  }

  /**
   * Authenticate using username/password (legacy API).
   * @internal
   */
  private async loginWithCredentials(): Promise<void> {
    logger.info('Authenticating with username/password...');

    const credentials = {
      username: config.unifi.username,
      password: config.unifi.password,
      remember: true,
    };

    // Try UniFi OS login first (newer controllers)
    try {
      const response = await this.client.post<UniFiLoginResponse>(
        '/api/auth/login',
        credentials
      );

      if (response.status === 200) {
        this.isLoggedIn = true;
        logger.info('Authentication successful (UniFi OS)');
        return;
      }
    } catch {
      // Try legacy endpoint
      logger.debug('UniFi OS login failed, trying legacy endpoint...');
    }

    // Try legacy controller login
    try {
      const response = await this.client.post<UniFiLoginResponse>(
        '/api/login',
        {
          username: config.unifi.username,
          password: config.unifi.password,
        }
      );

      if (response.data?.meta?.rc === 'ok' || response.status === 200) {
        this.isLoggedIn = true;
        logger.info('Authentication successful (Legacy)');
        return;
      }

      // Login rejected
      const errorMessage = response.data?.meta?.msg || 'Login rejected';
      throw new AuthenticationError(
        `Authentication failed: ${errorMessage}`,
        'unifi',
        'credentials'
      );
    } catch (error) {
      this.handleAuthError(error, 'credentials');
    }
  }

  /**
   * Handle authentication errors with detailed messages.
   * @internal
   */
  private handleAuthError(
    error: unknown,
    method: 'api_key' | 'credentials'
  ): never {
    // Already an AuthenticationError - rethrow
    if (error instanceof AuthenticationError) {
      throw error;
    }

    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;

    if (status === 401) {
      throw new AuthenticationError(
        method === 'api_key'
          ? 'API key is invalid or expired'
          : 'Username or password is incorrect',
        'unifi',
        method
      );
    }

    if (status === 403) {
      throw new AuthenticationError(
        method === 'api_key'
          ? 'API key does not have required permissions'
          : 'Account does not have required permissions',
        'unifi',
        method
      );
    }

    // Generic auth error
    const formatted = formatErrorForUser(error);
    throw new AuthenticationError(
      `Authentication failed: ${formatted.message}`,
      'unifi',
      method
    );
  }

  /**
   * Logout from the UniFi Controller.
   *
   * Cleans up the session for legacy auth. API key auth doesn't require logout.
   */
  async logout(): Promise<void> {
    if (!this.isLoggedIn) {
      return;
    }

    // API key auth doesn't need logout
    if (!this.useApiKey) {
      try {
        await this.client.post('/api/logout');
        logger.debug('Logged out from controller');
      } catch {
        // Ignore logout errors
      }
    }

    this.isLoggedIn = false;
    this.cookies = [];
    this.csrfToken = undefined;
    logger.info('Disconnected from UniFi Controller');
  }

  // ==========================================================================
  // Controller Info
  // ==========================================================================

  /**
   * Get controller information (version, name, etc.).
   *
   * @returns Controller info including version and type
   */
  async getControllerInfo(): Promise<ControllerInfo> {
    try {
      if (this.useApiKey) {
        // Try to get system info from new API
        try {
          const response = await this.client.get(`${API_BASE_PATH}/info`);
          if (response.data) {
            const info = response.data;
            this.controllerVersion = info.version || info.application_version;
            return {
              version: this.controllerVersion || 'unknown',
              name: info.hostname || info.name,
              type: 'unifi',
            };
          }
        } catch {
          // Info endpoint may not exist
        }

        return {
          version: 'API Key Auth',
          type: 'unifi',
        };
      }

      // Legacy API: Get sysinfo
      const response = await this.client.get(
        `/api/s/${config.unifi.site}/stat/sysinfo`
      );

      if (response.data?.data?.[0]) {
        const info = response.data.data[0];
        this.controllerVersion = info.version;
        return {
          version: info.version || 'unknown',
          name: info.hostname || info.name,
          type: 'unifi',
        };
      }
    } catch (error) {
      logger.warn('Failed to get controller info', {
        error: (error as Error).message,
      });
    }

    return {
      version: 'unknown',
      type: 'unifi',
    };
  }

  // ==========================================================================
  // Voucher Management
  // ==========================================================================

  /**
   * Get all vouchers from the controller.
   *
   * Fetches vouchers and normalizes them to the MappedVoucher format.
   * Handles pagination for the new API.
   *
   * @returns Array of normalized vouchers
   */
  async getVouchers(): Promise<MappedVoucher[]> {
    const rawVouchers = await this.fetchRawVouchers();
    return this.mapVouchers(rawVouchers);
  }

  /**
   * Fetch raw voucher data from the controller.
   * @internal
   */
  private async fetchRawVouchers(): Promise<UniFiVoucher[]> {
    if (!this.isLoggedIn) {
      await this.login();
    }

    logger.info('Fetching vouchers...');

    try {
      if (this.useApiKey) {
        return await this.fetchVouchersNewApi();
      }
      return await this.fetchVouchersLegacyApi();
    } catch (error) {
      // Handle session expiration
      if (this.isSessionExpired(error)) {
        logger.info('Session expired, re-authenticating...');
        this.isLoggedIn = false;
        await this.login();
        return this.fetchRawVouchers();
      }
      throw error;
    }
  }

  /**
   * Fetch vouchers using the new Integration API.
   * @internal
   */
  private async fetchVouchersNewApi(): Promise<UniFiVoucher[]> {
    let vouchers: UniFiVoucher[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.get(
        `${API_BASE_PATH}/sites/${this.siteId}/hotspot/vouchers`,
        { params: { offset, limit: VOUCHER_PAGE_SIZE } }
      );

      if (response.data) {
        const data = response.data.data || [];
        vouchers = vouchers.concat(data);

        // Check for more pages
        const totalCount = response.data.totalCount || 0;
        offset += data.length;
        hasMore = offset < totalCount && data.length > 0;

        if (hasMore) {
          logger.debug('Fetching more vouchers...', {
            fetched: vouchers.length,
            total: totalCount,
          });
        }
      } else {
        hasMore = false;
      }
    }

    logger.info('Vouchers fetched', { count: vouchers.length });
    return vouchers;
  }

  /**
   * Fetch vouchers using the legacy API.
   * @internal
   */
  private async fetchVouchersLegacyApi(): Promise<UniFiVoucher[]> {
    const response = await this.client.get<{
      meta: { rc: string; msg?: string };
      data: UniFiVoucher[];
    }>(`/api/s/${config.unifi.site}/stat/voucher`);

    if (response.data?.meta?.rc !== 'ok') {
      throw new ControllerError(
        response.data?.meta?.msg || 'Failed to fetch vouchers',
        'unifi'
      );
    }

    const vouchers = response.data.data || [];
    logger.info('Vouchers fetched', { count: vouchers.length });
    return vouchers;
  }

  /**
   * Map raw UniFi vouchers to normalized format.
   *
   * Handles both legacy and new API field naming conventions.
   * @internal
   */
  private mapVouchers(vouchers: UniFiVoucher[]): MappedVoucher[] {
    return vouchers.map((v) => {
      // Determine if this is new API format
      const isNewApi = !!v.id && !v._id;

      // Get create time
      let createTime: number;
      if (v.createdAt) {
        createTime = Math.floor(new Date(v.createdAt).getTime() / 1000);
      } else if (v.create_time) {
        createTime = v.create_time;
      } else {
        createTime = Math.floor(Date.now() / 1000);
      }

      // Get start time (when first used)
      let startTime: number | undefined;
      if (v.activatedAt) {
        startTime = Math.floor(new Date(v.activatedAt).getTime() / 1000);
      } else if (v.start_time) {
        startTime = v.start_time;
      }

      // Get duration in minutes
      const duration = v.timeLimitMinutes || v.duration || 0;

      // Get quota (how many guests can use it)
      const quota = v.authorizedGuestLimit || v.quota || 1;

      // Get used count
      const used = v.authorizedGuestCount || v.used || 0;

      // Determine status
      let status: string;
      if (v.expired === true) {
        status = 'EXPIRED';
      } else if (v.status) {
        status = v.status;
      } else if (used > 0 && quota === 1) {
        status = 'USED';
      } else if (quota === 1) {
        status = 'VALID_ONE';
      } else {
        status = 'VALID_MULTI';
      }

      return {
        id: v.id || v._id || v.code,
        code: v.code,
        duration,
        quota,
        createTime,
        startTime,
        used,
        status,
        qosRateMaxUp: v.txRateLimitKbps || v.qos_rate_max_up,
        qosRateMaxDown: v.rxRateLimitKbps || v.qos_rate_max_down,
        note: v.name || v.note,
      };
    });
  }

  /**
   * Delete a voucher from the controller.
   *
   * @param voucherId - The voucher ID to delete
   */
  async deleteVoucher(voucherId: string): Promise<void> {
    if (!this.isLoggedIn) {
      await this.login();
    }

    logger.info('Deleting voucher...', { voucherId });

    try {
      if (this.useApiKey) {
        await this.deleteVoucherNewApi(voucherId);
      } else {
        await this.deleteVoucherLegacyApi(voucherId);
      }

      logger.info('Voucher deleted', { voucherId });
    } catch (error) {
      // Handle session expiration
      if (this.isSessionExpired(error)) {
        logger.info('Session expired, re-authenticating...');
        this.isLoggedIn = false;
        await this.login();
        return this.deleteVoucher(voucherId);
      }
      throw error;
    }
  }

  /**
   * Delete voucher using new Integration API.
   * @internal
   */
  private async deleteVoucherNewApi(voucherId: string): Promise<void> {
    const response = await this.client.delete(
      `${API_BASE_PATH}/sites/${this.siteId}/hotspot/vouchers/${voucherId}`
    );

    if (response.status !== 200 && response.status !== 204) {
      throw new ControllerError(
        `Failed to delete voucher: HTTP ${response.status}`,
        'unifi'
      );
    }
  }

  /**
   * Delete voucher using legacy API.
   * @internal
   */
  private async deleteVoucherLegacyApi(voucherId: string): Promise<void> {
    const response = await this.client.post(
      `/api/s/${config.unifi.site}/cmd/hotspot`,
      {
        cmd: 'delete-voucher',
        _id: voucherId,
      }
    );

    if (response.data?.meta?.rc !== 'ok') {
      throw new ControllerError(
        response.data?.meta?.msg || 'Failed to delete voucher',
        'unifi'
      );
    }
  }

  // ==========================================================================
  // WLAN Management
  // ==========================================================================

  /**
   * Get available WLANs from the controller.
   *
   * @returns Array of available WLANs
   */
  async getAvailableWLANs(): Promise<AvailableWLAN[]> {
    if (!this.isLoggedIn) {
      await this.login();
    }

    logger.info('Fetching available WLANs...');

    try {
      const wlans = await this.fetchWLANs();

      // Map to normalized format
      const availableWLANs = wlans.map((wlan): AvailableWLAN => ({
        ssid: wlan.ssid || wlan.name || 'Unknown',
        name: wlan.name,
        enabled: wlan.isEnabled ?? wlan.enabled ?? true,
        security: this.mapSecurityMode(wlan),
        isGuest: wlan.isGuest ?? wlan.is_guest ?? false,
      }));

      // Filter to enabled WLANs only
      const enabledWLANs = availableWLANs.filter((w) => w.enabled !== false);

      logger.info('WLANs fetched', {
        total: wlans.length,
        enabled: enabledWLANs.length,
        guest: enabledWLANs.filter((w) => w.isGuest).length,
      });

      return enabledWLANs;
    } catch (error) {
      logger.warn('Failed to fetch WLANs', {
        error: (error as Error).message,
      });
      return []; // Non-critical feature, return empty array
    }
  }

  /**
   * Fetch WLAN configurations from the controller.
   * @internal
   */
  private async fetchWLANs(): Promise<UniFiWLAN[]> {
    // Try proxy path first (UDM/UDR devices)
    try {
      const response = await this.client.get(
        `/proxy/network/api/s/${config.unifi.site}/rest/wlanconf`
      );
      if (response.data?.data) {
        return response.data.data;
      }
    } catch {
      // Try without proxy prefix
    }

    // Try direct path (Cloud Key/self-hosted)
    const response = await this.client.get(
      `/api/s/${config.unifi.site}/rest/wlanconf`
    );
    return response.data?.data || [];
  }

  /**
   * Map UniFi security mode to normalized string.
   * @internal
   */
  private mapSecurityMode(wlan: UniFiWLAN): string {
    const securityMode = wlan.securityMode || wlan.security || wlan.wlanType;

    if (!securityMode || securityMode === 'open') {
      return 'open';
    }

    const normalized = securityMode.toLowerCase();
    if (normalized.includes('wpa3')) return 'wpa3';
    if (normalized.includes('wpa2')) return 'wpa2';
    if (normalized.includes('wpa')) return 'wpa';
    if (normalized.includes('wep')) return 'wep';

    return securityMode;
  }

  // ==========================================================================
  // Adapter Interface Implementation
  // ==========================================================================

  /**
   * Check if currently authenticated.
   */
  isAuthenticated(): boolean {
    return this.isLoggedIn;
  }

  /**
   * Get the controller type identifier.
   */
  getType(): string {
    return 'unifi';
  }

  /**
   * Get capabilities supported by this adapter.
   */
  getCapabilities(): AgentCapabilities {
    return {
      canListWLANs: true,
      canCreateVouchers: false, // Future feature
      canDeleteVouchers: true,
    };
  }

  /**
   * Get the controller version (after login).
   */
  getControllerVersion(): string | undefined {
    return this.controllerVersion;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if an error indicates an expired session.
   * @internal
   */
  private isSessionExpired(error: unknown): boolean {
    const axiosError = error as AxiosError;
    return axiosError.response?.status === 401;
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

/** Singleton instance */
let instance: UniFiAdapter | null = null;

/**
 * Get the singleton UniFi adapter instance.
 *
 * Creates the instance on first call.
 *
 * @returns UniFi adapter instance
 */
export function getUniFiAdapter(): UniFiAdapter {
  if (!instance) {
    instance = new UniFiAdapter();
  }
  return instance;
}

/**
 * Reset the singleton instance.
 *
 * Useful for testing or reconfiguration.
 */
export function resetUniFiAdapter(): void {
  instance = null;
}
