# Vorio Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io%2Frocobyte%2Fvorio--agent-blue)](https://github.com/RocoByte/vorio-agent/pkgs/container/vorio-agent)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org/)

**Vorio Agent** connects your local WiFi controller to the [Vorio Cloud](https://vorio.app) platform, enabling centralized management of your hotspot infrastructure.

## Features

- **Voucher Sync** - Automatic synchronization every 2 minutes (configurable)
- **Remote Commands** - Receive and execute commands from Vorio Cloud
- **WLAN Discovery** - Reports available WiFi networks to Vorio
- **Secure** - TLS encryption, no incoming ports required
- **Extensible** - Adapter pattern for multiple controller types

## Supported Controllers

| Controller | Status | Authentication |
|------------|--------|----------------|
| **UniFi Network** | Supported | API Key (recommended) or Username/Password |
| MikroTik RouterOS | Planned | - |
| OpenWRT | Planned | - |

## Quick Start

### Prerequisites

- [Vorio Account](https://vorio.app) with an active project
- Docker and Docker Compose
- Network access to your controller

### 1. Get Your Agent Token

1. Log in to [Vorio](https://vorio.app) and open your project
2. Go to **Settings > Connection**
3. Click **"Connect UniFi"**
4. Copy the displayed **Agent Token**

### 2. Create docker-compose.yml

```yaml
services:
  vorio-agent:
    image: ghcr.io/rocobyte/vorio-agent:latest
    container_name: vorio-agent
    restart: unless-stopped
    environment:
      # Vorio Cloud (token from Vorio dashboard)
      - VORIO_AGENT_TOKEN=vat_xxxxxxxxxxxxx

      # UniFi Controller
      - UNIFI_HOST=192.168.1.1
      - UNIFI_PORT=443
      - UNIFI_SITE=default
      - UNIFI_SKIP_SSL_VERIFY=true

      # Authentication (Option A: API Key - recommended)
      - UNIFI_API_KEY=your_api_key

      # Authentication (Option B: Username/Password)
      # - UNIFI_USERNAME=admin
      # - UNIFI_PASSWORD=your_password
```

### 3. Start the Agent

```bash
docker compose up -d
```

### 4. Verify Connection

```bash
docker compose logs -f
```

You should see:

```
  Vorio Agent v1.0.0

2024-01-15 10:30:45 INFO  [Agent] Configuration loaded
2024-01-15 10:30:45 INFO  [Agent] Controller type=UniFi host=192.168.1.1 port=443
2024-01-15 10:30:45 INFO  [Network] UniFi Controller is reachable host=192.168.1.1
2024-01-15 10:30:46 INFO  [UniFi] Authentication successful site=default
2024-01-15 10:30:46 INFO  [Vorio] Connected to Vorio Cloud
2024-01-15 10:30:47 INFO  [Sync] Voucher sync completed count=42
2024-01-15 10:30:47 INFO  [Sync] Service started
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `VORIO_AGENT_TOKEN` | Yes | - | Agent token from Vorio dashboard |
| `VORIO_API_URL` | No | `https://api.vorio.app` | Vorio API URL (usually not needed) |
| `CONTROLLER_TYPE` | No | `unifi` | Controller type (unifi, mikrotik, openwrt) |
| `UNIFI_HOST` | Yes* | - | UniFi Controller IP or hostname |
| `UNIFI_PORT` | No | `443` | UniFi Controller port |
| `UNIFI_SITE` | No | `default` | UniFi site name |
| `UNIFI_API_KEY` | ** | - | UniFi API key (recommended) |
| `UNIFI_USERNAME` | ** | - | UniFi username (legacy) |
| `UNIFI_PASSWORD` | ** | - | UniFi password (legacy) |
| `UNIFI_SKIP_SSL_VERIFY` | No | `false` | Skip SSL certificate verification |
| `SYNC_INTERVAL_MS` | No | `120000` | Sync interval in milliseconds (2 min) |
| `COMMAND_POLL_INTERVAL_MS` | No | `10000` | Command poll interval (10 sec) |
| `LOG_LEVEL` | No | `info` | Log level (debug, info, warn, error) |

\* Required when `CONTROLLER_TYPE=unifi`
\*\* Either `UNIFI_API_KEY` **or** both `UNIFI_USERNAME` and `UNIFI_PASSWORD`

### UniFi Authentication

#### API Key (Recommended for UniFi OS 8.0+)

1. Open UniFi Network Application
2. Go to **Settings > Admins & Users > API Keys**
3. Create a new API key with read permissions
4. Set `UNIFI_API_KEY` in your configuration

#### Username/Password (Legacy)

For older controllers without API key support:
- Use `UNIFI_USERNAME` and `UNIFI_PASSWORD`
- The user needs read permissions for Hotspot/Vouchers

## Architecture

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
│                     │                    │    api.vorio.app     │
└─────────────────────┘                    └─────────────────────┘
```

The agent:
- Runs in your local network as a Docker container
- Connects outbound to both the controller and Vorio Cloud
- Requires no incoming ports or port forwarding
- Syncs vouchers every 2 minutes (configurable)
- Polls for commands every 10 seconds

## Docker Commands

```bash
# Start the agent
docker compose up -d

# View logs
docker compose logs -f

# Stop the agent
docker compose down

# Restart the agent
docker compose restart

# Update to latest version
docker compose pull && docker compose up -d
```

## Troubleshooting

### Connection Refused to UniFi Controller

**Symptoms:** `Connection refused - Controller is not reachable`

**Solutions:**
- Verify the controller is running and accessible
- Check `UNIFI_HOST` and `UNIFI_PORT` are correct
- Ensure the Docker container can reach the controller's network
- For UDM devices, the port might be different (usually 443)

### SSL Certificate Error

**Symptoms:** `SSL/TLS certificate verification failed`

**Solutions:**
- Set `UNIFI_SKIP_SSL_VERIFY=true` for self-signed certificates
- Note: This is acceptable for local networks but reduces security

### Authentication Failed

**Symptoms:** `Authentication failed - Invalid credentials`

**Solutions:**
- Double-check your API key or username/password
- For API keys: Verify the key has the required permissions
- For username/password: Ensure the account has Hotspot/Voucher access

### Vorio Connection Failed

**Symptoms:** `Could not connect to Vorio Cloud`

**Solutions:**
- Verify `VORIO_API_URL` is correct (`https://api.vorio.app`)
- Check `VORIO_AGENT_TOKEN` is correctly copied (starts with `vat_`)
- Ensure outbound HTTPS connections are allowed

### No Vouchers Syncing

**Solutions:**
- Check if vouchers exist in your controller
- Verify the configured site has vouchers
- Check the user/API key has permissions to read vouchers
- Review logs for specific error messages

## Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/RocoByte/vorio-agent.git
cd vorio-agent

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your test configuration

# Run in development mode
npm run dev

# Build
npm run build

# Run production build
npm start
```

### Project Structure

```
src/
├── index.ts              # Entry point
├── core/                 # Core infrastructure
│   ├── config/           # Configuration management
│   ├── errors/           # Custom error classes
│   └── logger/           # Logging system
├── adapters/             # Controller adapters
│   ├── base.ts           # Base interface
│   ├── unifi.ts          # UniFi implementation
│   └── index.ts          # Factory
├── services/             # Business logic
│   ├── sync-service.ts   # Main orchestration
│   └── vorio-client.ts   # Vorio API client
└── types/                # TypeScript definitions
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Adding Support for New Controllers

The agent uses an adapter pattern to support multiple controller types. See the [Adapter Development Guide](docs/ADAPTER_GUIDE.md) for instructions on adding support for new controllers.

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Adapter Development Guide](docs/ADAPTER_GUIDE.md)
- [Contributing Guidelines](CONTRIBUTING.md)

## Security

- All connections use TLS encryption
- No incoming ports required (all connections are outbound)
- Container runs as non-root user (UID 1001)
- Credentials are only stored in memory, never persisted
- API keys and passwords are redacted in logs

## Links

- **Vorio Cloud:** https://vorio.app
- **Repository:** https://github.com/RocoByte/vorio-agent
- **Docker Image:** `ghcr.io/rocobyte/vorio-agent:latest`
- **Issues:** https://github.com/RocoByte/vorio-agent/issues

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Made with care by [RocoByte](https://github.com/RocoByte)
