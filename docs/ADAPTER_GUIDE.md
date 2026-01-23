# Adapter Development Guide

This guide explains how to create a new controller adapter for the Vorio Agent. Adapters allow the agent to work with different WiFi hotspot controllers (UniFi, MikroTik, OpenWRT, etc.).

## Overview

The Vorio Agent uses the **Adapter Pattern** to support multiple controller types. Each adapter implements a common interface (`ControllerAdapter`), allowing the sync service to work with any controller through the same API.

```
┌─────────────────────────────────────────┐
│           Sync Service                   │
│                                          │
│  getVouchers() ──► adapter.getVouchers() │
│  deleteVoucher() ► adapter.deleteVoucher()│
└─────────────────┬────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
    ▼                           ▼
┌──────────────┐        ┌──────────────┐
│ UniFi Adapter │        │ Your Adapter │
└──────────────┘        └──────────────┘
```

## The ControllerAdapter Interface

Your adapter must implement this interface:

```TypeScript
interface ControllerAdapter {
  // Authentication
  login(): Promise<void>;
  logout(): Promise<void>;
  isAuthenticated(): boolean;

  // Controller info
  getControllerInfo(): Promise<ControllerInfo>;
  getType(): string;
  getCapabilities(): AgentCapabilities;

  // Voucher operations
  getVouchers(): Promise<MappedVoucher[]>;
  deleteVoucher(voucherId: string): Promise<void>;

  // Optional: WLAN listing
  getAvailableWLANs(): Promise<AvailableWLAN[]>;
}
```

## Step-by-Step Guide

### Step 1: Create the Adapter File

Create a new file `src/adapters/yourcontroller.ts`:

```TypeScript
/**
 * @fileoverview YourController Adapter
 *
 * This adapter enables the Vorio Agent to communicate with
 * YourController for voucher management.
 *
 * @module adapters/yourcontroller
 */

import { ControllerAdapter, ControllerInfo } from './base';
import { config } from '../core/config';
import { createLogger } from '../core/logger';
import {
  AuthenticationError,
  ConnectionError,
  ControllerError,
} from '../core/errors';
import {
  MappedVoucher,
  AvailableWLAN,
  AgentCapabilities,
} from '../types';

const logger = createLogger('YourController');

export class YourControllerAdapter implements ControllerAdapter {
  private isLoggedIn = false;

  // ... implement methods
}
```

### Step 2: Implement Authentication

```TypeScript
async login(): Promise<void> {
  logger.info('Connecting to controller...', {
    host: config.yourcontroller.host,
  });

  try {
    // Your authentication logic here
    // Example: API call to authenticate

    this.isLoggedIn = true;
    logger.info('Connected successfully');
  } catch (error) {
    // Handle different error types
    if (this.isNetworkError(error)) {
      throw new ConnectionError(
        'Cannot reach controller',
        'yourcontroller',
        config.yourcontroller.host,
        config.yourcontroller.port
      );
    }

    throw new AuthenticationError(
      'Authentication failed',
      'yourcontroller',
      'credentials'
    );
  }
}

async logout(): Promise<void> {
  if (!this.isLoggedIn) return;

  try {
    // Your logout logic here
  } catch {
    // Ignore logout errors
  }

  this.isLoggedIn = false;
  logger.info('Disconnected');
}

isAuthenticated(): boolean {
  return this.isLoggedIn;
}
```

### Step 3: Implement Voucher Fetching

The most important method - fetch and normalize vouchers:

```TypeScript
async getVouchers(): Promise<MappedVoucher[]> {
  if (!this.isLoggedIn) {
    await this.login();
  }

  logger.info('Fetching vouchers...');

  try {
    // 1. Fetch raw vouchers from your controller
    const rawVouchers = await this.fetchVouchersFromController();

    // 2. Transform to normalized format
    const mappedVouchers = rawVouchers.map(this.mapVoucher);

    logger.info('Vouchers fetched', { count: mappedVouchers.length });
    return mappedVouchers;
  } catch (error) {
    // Handle session expiration
    if (this.isSessionExpired(error)) {
      this.isLoggedIn = false;
      await this.login();
      return this.getVouchers();
    }
    throw error;
  }
}

private mapVoucher(raw: RawVoucher): MappedVoucher {
  return {
    id: raw.id,                    // Required: unique identifier
    code: raw.code,                // Required: voucher code
    duration: raw.duration,        // Optional: minutes
    quota: raw.maxUsers || 1,      // Required: max uses
    createTime: raw.createdAt,     // Required: Unix timestamp
    startTime: raw.firstUsedAt,    // Optional: Unix timestamp
    used: raw.usageCount || 0,     // Required: times used
    status: this.mapStatus(raw),   // Required: status string
    qosRateMaxUp: raw.uploadLimit, // Optional: kbps
    qosRateMaxDown: raw.downloadLimit,
    note: raw.description,         // Optional
  };
}

private mapStatus(raw: RawVoucher): string {
  if (raw.expired) return 'EXPIRED';
  if (raw.used >= raw.maxUsers) return 'USED';
  if (raw.maxUsers === 1) return 'VALID_ONE';
  return 'VALID_MULTI';
}
```

### Step 4: Implement Voucher Deletion

```TypeScript
async deleteVoucher(voucherId: string): Promise<void> {
  if (!this.isLoggedIn) {
    await this.login();
  }

  logger.info('Deleting voucher...', { voucherId });

  try {
    // Your delete logic here
    await this.callDeleteApi(voucherId);
    logger.info('Voucher deleted', { voucherId });
  } catch (error) {
    if (this.isSessionExpired(error)) {
      this.isLoggedIn = false;
      await this.login();
      return this.deleteVoucher(voucherId);
    }
    throw new ControllerError(
      `Failed to delete voucher: ${error.message}`,
      'yourcontroller'
    );
  }
}
```

### Step 5: Implement Info Methods

```TypeScript
async getControllerInfo(): Promise<ControllerInfo> {
  try {
    const info = await this.fetchControllerInfo();
    return {
      version: info.version || 'unknown',
      name: info.hostname,
      type: 'yourcontroller',
    };
  } catch {
    return {
      version: 'unknown',
      type: 'yourcontroller',
    };
  }
}

getType(): string {
  return 'yourcontroller';
}

getCapabilities(): AgentCapabilities {
  return {
    canListWLANs: true,        // Set to true if supported
    canCreateVouchers: false,  // Not yet used
    canDeleteVouchers: true,   // Set based on capability
  };
}
```

### Step 6: Implement WLAN Listing (Optional)

```TypeScript
async getAvailableWLANs(): Promise<AvailableWLAN[]> {
  if (!this.isLoggedIn) {
    await this.login();
  }

  try {
    const wlans = await this.fetchWLANs();
    return wlans.map(wlan => ({
      ssid: wlan.ssid,
      name: wlan.friendlyName,
      enabled: wlan.enabled,
      security: wlan.security,  // 'open', 'wpa2', 'wpa3'
      isGuest: wlan.isGuestNetwork,
    }));
  } catch (error) {
    logger.warn('Failed to fetch WLANs', { error: error.message });
    return [];  // Non-critical, return empty array
  }
}
```

### Step 7: Add Singleton Factory

```TypeScript
let instance: YourControllerAdapter | null = null;

export function getYourControllerAdapter(): YourControllerAdapter {
  if (!instance) {
    instance = new YourControllerAdapter();
  }
  return instance;
}

export function resetYourControllerAdapter(): void {
  instance = null;
}
```

### Step 8: Register the Adapter

In `src/adapters/index.ts`, add your adapter:

```TypeScript
import { YourControllerAdapter, getYourControllerAdapter, resetYourControllerAdapter } from './yourcontroller';

// Add to exports
export { YourControllerAdapter } from './yourcontroller';

// Add to factory
export function createAdapter(type?: ControllerType): ControllerAdapter {
  const adapterType = type || config.controllerType;

  switch (adapterType) {
    case 'unifi':
      return new UniFiAdapter();
    case 'yourcontroller':           // Add this case
      return new YourControllerAdapter();
    // ...
  }
}

// Add to reset function
export function resetAdapter(): void {
  adapterInstance = null;
  resetUniFiAdapter();
  resetYourControllerAdapter();  // Add this
}
```

### Step 9: Add Configuration

In `src/core/config/index.ts`:

```TypeScript
// Add to ControllerType
export type ControllerType = 'unifi' | 'mikrotik' | 'openwrt' | 'yourcontroller' | 'custom';

// Add configuration interface
export interface YourControllerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  // ... other options
}

// Add to config loading
function loadYourControllerConfig(controllerType: ControllerType): YourControllerConfig {
  const isYours = controllerType === 'yourcontroller';
  return {
    host: isYours ? requireEnv('YOUR_HOST') : optionalEnv('YOUR_HOST', ''),
    port: optionalEnvNumber('YOUR_PORT', 8080),
    username: isYours ? requireEnv('YOUR_USERNAME') : optionalEnv('YOUR_USERNAME', ''),
    password: isYours ? requireEnv('YOUR_PASSWORD') : optionalEnv('YOUR_PASSWORD', ''),
  };
}
```

## Best Practices

### Error Handling

Always use the custom error classes:

```TypeScript
// Network errors
throw new ConnectionError(message, 'yourcontroller', host, port);

// Auth errors
throw new AuthenticationError(message, 'yourcontroller', 'credentials');

// API errors
throw new ControllerError(message, 'yourcontroller');
```

### Logging

Use structured logging with context:

```TypeScript
logger.info('Fetching vouchers', { page: 1, limit: 100 });
logger.warn('Rate limited, retrying', { retryAfter: 30 });
logger.error('Failed to connect', { host, error: err.message });
```

### Session Management

Handle session expiration gracefully:

```TypeScript
try {
  return await this.apiCall();
} catch (error) {
  if (error.status === 401) {
    this.isLoggedIn = false;
    await this.login();
    return await this.apiCall();  // Retry once
  }
  throw error;
}
```

### Pagination

Handle paginated APIs internally:

```TypeScript
async getVouchers(): Promise<MappedVoucher[]> {
  let allVouchers: MappedVoucher[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await this.fetchPage(page);
    allVouchers = allVouchers.concat(response.data);
    hasMore = response.hasNextPage;
    page++;
  }

  return allVouchers;
}
```

## Testing Your Adapter

### Unit Tests

Create `tests/adapters/yourcontroller.test.ts`:

```TypeScript
import { YourControllerAdapter } from '../../src/adapters/yourcontroller';

describe('YourControllerAdapter', () => {
  let adapter: YourControllerAdapter;

  beforeEach(() => {
    adapter = new YourControllerAdapter();
  });

  describe('login', () => {
    it('should authenticate successfully', async () => {
      // Mock your HTTP client
      await expect(adapter.login()).resolves.not.toThrow();
      expect(adapter.isAuthenticated()).toBe(true);
    });
  });

  describe('getVouchers', () => {
    it('should return normalized vouchers', async () => {
      await adapter.login();
      const vouchers = await adapter.getVouchers();

      expect(vouchers).toBeInstanceOf(Array);
      if (vouchers.length > 0) {
        expect(vouchers[0]).toHaveProperty('id');
        expect(vouchers[0]).toHaveProperty('code');
        expect(vouchers[0]).toHaveProperty('status');
      }
    });
  });
});
```

### Integration Testing

Test against a real controller:

```bash
# Set environment variables
export CONTROLLER_TYPE=yourcontroller
export YOUR_HOST=192.168.1.1
export YOUR_USERNAME=admin
export YOUR_PASSWORD=secret

# Run the agent
npm run dev
```

## Example: MikroTik Adapter Skeleton

Here's a skeleton for a MikroTik adapter:

```TypeScript
/**
 * @fileoverview MikroTik RouterOS Adapter
 *
 * Connects to MikroTik RouterOS via the API for voucher management.
 */

import { ControllerAdapter } from './base';
import { config } from '../core/config';
import { createLogger } from '../core/logger';

const logger = createLogger('MikroTik');

export class MikroTikAdapter implements ControllerAdapter {
  private isLoggedIn = false;
  // private api: MikroTikApi;  // Your API client

  async login(): Promise<void> {
    logger.info('Connecting to MikroTik...', {
      host: config.mikrotik.host,
    });

    // TODO: Implement MikroTik API connection
    // this.api = new MikroTikApi(config.mikrotik);
    // await this.api.connect();

    this.isLoggedIn = true;
  }

  async logout(): Promise<void> {
    // await this.api?.disconnect();
    this.isLoggedIn = false;
  }

  async getVouchers(): Promise<MappedVoucher[]> {
    // TODO: Fetch from /ip/hotspot/user
    // const users = await this.api.call('/ip/hotspot/user/print');
    // return users.filter(u => u.profile === 'voucher').map(this.mapVoucher);
    return [];
  }

  async deleteVoucher(voucherId: string): Promise<void> {
    // await this.api.call('/ip/hotspot/user/remove', { '.id': voucherId });
  }

  // ... other methods
}
```

## Need Help?

- Check the [UniFi adapter](../src/adapters/unifi.ts) as a reference
- Open an issue on GitHub for questions
- Read the [Architecture documentation](./ARCHITECTURE.md)
