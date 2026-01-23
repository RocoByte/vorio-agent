# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (skip prepare script, we'll build after copying source)
RUN npm ci --ignore-scripts

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S vorio && \
    adduser -S vorio -u 1001 -G vorio

# Copy package files
COPY package*.json ./

# Install only production dependencies (skip prepare script since we copy pre-built dist)
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R vorio:vorio /app

# Switch to non-root user
USER vorio

# Health check - agent is running if process exists
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD pgrep -f "node dist/index.js" > /dev/null || exit 1

# Run the agent
CMD ["node", "dist/index.js"]
