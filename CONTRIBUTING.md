# Contributing to Vorio Agent

Thank you for your interest in contributing to the Vorio Agent! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Coding Guidelines](#coding-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Adding New Controller Support](#adding-new-controller-support)

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributions from everyone who wishes to improve the project.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vorio-agent.git
   cd vorio-agent
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/RocoByte/vorio-agent.git
   ```

## Development Setup

### Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- A UniFi Controller (or other supported controller) for testing

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your test configuration
# (Use a test controller, not production!)
```

### Running in Development

```bash
# Run with ts-node (auto-reload on changes)
npm run dev

# Run compiled version
npm run build
npm start
```

### Environment Variables for Development

```bash
# Required
VORIO_API_URL=https://api.vorio.app
VORIO_AGENT_TOKEN=vat_your_test_token

# UniFi Controller (test environment)
UNIFI_HOST=192.168.1.1
UNIFI_API_KEY=your_test_api_key
# or
UNIFI_USERNAME=test_user
UNIFI_PASSWORD=test_password
UNIFI_SITE=default
UNIFI_SKIP_SSL_VERIFY=true

# Optional: Enable debug logging
LOG_LEVEL=debug
```

## Project Structure

```
src/
├── index.ts              # Application entry point
├── core/                 # Core infrastructure
│   ├── config/           # Configuration management
│   ├── errors/           # Custom error classes
│   └── logger/           # Logging infrastructure
├── adapters/             # Controller adapters
│   ├── base.ts           # Base interface
│   ├── unifi.ts          # UniFi implementation
│   └── index.ts          # Factory
├── services/             # Business logic
│   ├── sync-service.ts   # Main orchestration
│   └── vorio-client.ts   # API client
└── types/                # TypeScript types
    └── index.ts

docs/                     # Documentation
├── ARCHITECTURE.md       # System architecture
└── ADAPTER_GUIDE.md      # Guide for new adapters

tests/                    # Test files (planned)
```

## Making Changes

### 1. Create a Branch

```bash
# Update your local main
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Your Changes

- Write clean, documented code
- Follow the existing code style
- Add JSDoc comments for public APIs
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run the linter
npm run lint

# Build to check for type errors
npm run build

# Test with a real controller (if possible)
npm run dev
```

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add support for MikroTik RouterOS"
```

## Coding Guidelines

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Define interfaces for all data structures
- Avoid `any` types - use `unknown` if necessary
- Use explicit return types on public functions

### Code Style

```TypeScript
// Good: Clear, documented function
/**
 * Fetch all vouchers from the controller.
 *
 * @returns Array of normalized vouchers
 * @throws ControllerError if fetching fails
 */
async getVouchers(): Promise<MappedVoucher[]> {
  // Implementation
}

// Bad: No documentation, unclear types
async getVouchers() {
  // Implementation
}
```

### Error Handling

- Use custom error classes from `src/core/errors/`
- Include context in errors
- Provide user-friendly error messages

```TypeScript
// Good
throw new AuthenticationError(
  'API key is invalid or expired',
  'unifi',
  'api_key'
);

// Bad
throw new Error('Auth failed');
```

### Logging

- Use the logger from `src/core/logger/`
- Include relevant context in log messages
- Use appropriate log levels

```TypeScript
// Good
logger.info('Vouchers fetched', { count: vouchers.length });
logger.error('Connection failed', { host, error: err.message });

// Bad
console.log('Got ' + vouchers.length + ' vouchers');
```

### File Organization

- One class/major export per file
- Group related functionality in directories
- Use index.ts for re-exports

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, semicolons, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(adapter): add MikroTik RouterOS support

Implements the ControllerAdapter interface for MikroTik devices.
Supports voucher listing and deletion via the RouterOS API.

Closes #42
```

```
fix(unifi): handle session expiration during voucher fetch

The adapter now automatically re-authenticates if the session
expires during a long-running operation.
```

## Pull Request Process

### Before Submitting

1. **Update your branch** with the latest upstream changes:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Ensure all checks pass**:
   ```bash
   npm run lint
   npm run build
   ```

3. **Test your changes** with a real controller if possible

### Submitting

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a Pull Request on GitHub

3. Fill out the PR template:
   - Describe what the PR does
   - Link related issues
   - List any breaking changes
   - Include testing instructions

### PR Review

- Address review feedback promptly
- Keep the PR focused on one feature/fix
- Squash commits if requested

## Adding New Controller Support

We welcome contributions that add support for new WiFi controllers!

### Steps

1. **Read the Adapter Guide**: [docs/ADAPTER_GUIDE.md](docs/ADAPTER_GUIDE.md)

2. **Create the adapter** in `src/adapters/`

3. **Add configuration** in `src/core/config/`

4. **Register the adapter** in `src/adapters/index.ts`

5. **Document** the new controller in README.md

6. **Test thoroughly** with a real device

### Requirements for New Adapters

- [ ] Implements full `ControllerAdapter` interface
- [ ] Uses custom error classes
- [ ] Uses the logger for all output
- [ ] Handles authentication errors gracefully
- [ ] Handles session expiration
- [ ] Includes JSDoc documentation
- [ ] Added to adapter factory
- [ ] Configuration added with validation
- [ ] Documented in README

## Questions?

- Open an issue for questions or discussion
- Check existing issues and PRs
- Read the [Architecture documentation](docs/ARCHITECTURE.md)

Thank you for contributing!
