# Architecture

This document describes the architecture of the Vorio Agent, explaining how the different components work together to sync vouchers from WiFi controllers to Vorio Cloud.

## Overview

The Vorio Agent is a Node.js application that bridges WiFi hotspot controllers (like UniFi) with the Vorio Cloud platform. It runs as a background service, periodically syncing vouchers and responding to commands from Vorio Cloud.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Vorio Agent                                │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Adapter    │    │    Sync      │    │    Vorio Client      │  │
│  │   (UniFi)    │◄──►│   Service    │◄──►│                      │  │
│  └──────┬───────┘    └──────────────┘    └──────────┬───────────┘  │
│         │                                           │               │
└─────────┼───────────────────────────────────────────┼───────────────┘
          │                                           │
          ▼                                           ▼
┌─────────────────────┐                    ┌─────────────────────┐
│   UniFi Controller  │                    │    Vorio Cloud      │
│   (or MikroTik,     │                    │                     │
│    OpenWRT, etc.)   │                    │                     │
└─────────────────────┘                    └─────────────────────┘
```

## Project Structure

```
src/
├── index.ts              # Application entry point
├── core/                 # Core infrastructure
│   ├── index.ts          # Core module exports
│   ├── config/           # Configuration management
│   │   └── index.ts      # Config loading & validation
│   ├── errors/           # Custom error classes
│   │   └── index.ts      # Error definitions
│   └── logger/           # Logging infrastructure
│       └── index.ts      # Logger implementation
├── adapters/             # Controller adapters
│   ├── index.ts          # Adapter factory
│   ├── base.ts           # Base adapter interface
│   └── unifi.ts          # UniFi implementation
├── services/             # Business logic services
│   ├── index.ts          # Service exports
│   ├── sync-service.ts   # Main orchestration
│   └── vorio-client.ts   # Vorio API client
└── types/                # TypeScript type definitions
    └── index.ts          # All interfaces and types
```

## Core Modules

### Configuration (`src/core/config/`)

The configuration module handles:
- Loading environment variables (with `.env` support via dotenv)
- Validating configuration values
- Providing typed access to configuration

Key features:
- Required vs optional variables with defaults
- Type conversion (string, number, boolean)
- Validation with detailed error messages
- Redacted config output for safe logging

### Error Handling (`src/core/errors/`)

Custom error classes provide structured error handling:

```
VorioAgentError (base)
├── ConfigurationError     # Invalid configuration
├── ControllerError        # Controller issues
│   ├── AuthenticationError  # Auth failures
│   └── ConnectionError      # Network issues
├── VorioApiError          # Vorio API errors
└── SyncError              # Sync failures
```

Each error includes:
- Error code for programmatic handling
- Timestamp for debugging
- Context object with additional details
- JSON serialization support

### Logger (`src/core/logger/`)

The logger provides:
- Log levels (debug, info, warn, error)
- Colored terminal output
- Module prefixes for tracing
- Structured context data
- User-friendly error formatting

## Adapter Pattern

The adapter pattern allows supporting multiple controller types through a unified interface.

### Interface

```TypeScript
interface ControllerAdapter {
  login(): Promise<void>;
  logout(): Promise<void>;
  getControllerInfo(): Promise<ControllerInfo>;
  getVouchers(): Promise<MappedVoucher[]>;
  deleteVoucher(voucherId: string): Promise<void>;
  isAuthenticated(): boolean;
  getType(): string;
  getCapabilities(): AgentCapabilities;
  getAvailableWLANs(): Promise<AvailableWLAN[]>;
}
```

### Implementing a New Adapter

1. Create a new file in `src/adapters/` (e.g., `mikrotik.ts`)
2. Implement the `ControllerAdapter` interface
3. Register in `src/adapters/index.ts`
4. Add config type to `ControllerType`

See [ADAPTER_GUIDE.md](./ADAPTER_GUIDE.md) for detailed instructions.

### UniFi Adapter

The UniFi adapter supports two authentication methods:

1. **API Key** (recommended for UniFi 8.0+)
   - Uses `X-API-KEY` header
   - Stateless, no session management
   - Base path: `/proxy/network/integration/v1`

2. **Username/Password** (legacy)
   - Session-based with cookies
   - CSRF token handling
   - Supports both UniFi OS and legacy controllers

## Services

### Sync Service (`src/services/sync-service.ts`)

The main orchestration service that:

1. **Startup**
   - Logs into the controller
   - Fetches controller info and capabilities
   - Connects to Vorio Cloud
   - Performs initial sync

2. **Runtime**
   - Command poll loop (every 10 seconds)
   - Sync loop (every 2 minutes by default)
   - Heartbeat sending

3. **Shutdown**
   - Stops all loops
   - Disconnects gracefully
   - Cleans up resources

### Vorio Client (`src/services/vorio-client.ts`)

HTTP client for Vorio Cloud API:

| Endpoint | Description |
|----------|-------------|
| `POST /api/agent/connect` | Register agent |
| `POST /api/agent/sync` | Upload vouchers |
| `GET /api/agent/commands` | Get pending commands |
| `POST /api/agent/commands/{id}/ack` | Acknowledge command |
| `POST /api/agent/commands/{id}/complete` | Complete command |
| `POST /api/agent/heartbeat` | Send status |
| `POST /api/agent/disconnect` | Disconnect |

## Data Flow

### Voucher Sync Flow

```
1. SyncService.performSync()
   │
   ├── 2. adapter.getVouchers()
   │       ├── Fetch raw vouchers from controller
   │       └── Transform to MappedVoucher format
   │
   └── 3. vorioClient.syncVouchers(vouchers)
           └── Upload to Vorio Cloud
```

### Command Processing Flow

```
1. SyncService.processCommands()
   │
   ├── 2. vorioClient.getCommands()
   │       └── Fetch pending commands
   │
   ├── 3. For each command:
   │       ├── vorioClient.acknowledgeCommand(id)
   │       ├── Execute command (sync/delete/disconnect)
   │       └── vorioClient.completeCommand(id, success)
   │
   └── 4. Handle errors and report failures
```

## Type System

### Vorio API Types

```TypeScript
VorioCommand         // Commands from Vorio Cloud
VorioConnectResponse // Connection response
VorioSyncResponse    // Sync result
VorioCommandsResponse // Command list
```

### UniFi API Types

```TypeScript
UniFiVoucher        // Raw voucher data (both API versions)
UniFiLoginResponse  // Auth response
UniFiWLAN           // WLAN configuration
```

### Internal Types

```TypeScript
MappedVoucher       // Normalized voucher format
AgentStatus         // Current agent state
AvailableWLAN       // WLAN info for Vorio
AgentCapabilities   // Feature flags
ControllerInfo      // Controller metadata
```

## Error Handling Strategy

1. **Connection Errors**: Detailed messages with host/port info
2. **Auth Errors**: Clear indication of auth method that failed
3. **API Errors**: HTTP status codes and response data
4. **Sync Errors**: Partial sync info (total/synced counts)

All errors include:
- User-friendly message
- Suggestion for resolution
- Technical details for debugging

## Security Considerations

1. **Credentials**: Only stored in memory, never persisted
2. **SSL/TLS**: Verification enabled by default, opt-out available
3. **Token Auth**: Bearer token for Vorio, API key for UniFi
4. **Docker**: Runs as non-root user (UID 1001)

## Extensibility Points

1. **New Controllers**: Implement `ControllerAdapter` interface
2. **New Commands**: Add to `VorioCommand.type` union and handler
3. **New Features**: Add capabilities to `AgentCapabilities`
4. **Custom Logging**: Configure logger with JSON output for aggregation
