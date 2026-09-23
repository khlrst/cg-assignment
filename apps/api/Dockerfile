# Multi-stage build for API
FROM node:24-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY pnpm-workspace.yaml ./

# Copy source code
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/evm ./packages/evm
COPY packages/logger ./packages/logger

# Build stage
FROM base AS build

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build packages first (Добавлена сборка логгера, если она есть)
WORKDIR /app/packages/logger
RUN pnpm build || echo "No logger build script"
WORKDIR /app/packages/db
RUN pnpm build || echo "No db build script"
WORKDIR /app/packages/evm
RUN pnpm build || echo "No evm build script"

# Build API
WORKDIR /app/apps/api
RUN pnpm build

# Production stage
FROM node:24-alpine AS production

# Create app directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy root workspace files
COPY --from=build /app/package.json /app/pnpm-lock.yaml* /app/pnpm-workspace.yaml ./

# Copy package.json files for each package
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages/logger/package.json ./packages/logger/
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/packages/evm/package.json ./packages/evm/

# Install prod dependencies for API and its dependencies
RUN pnpm install --frozen-lockfile --prod --filter api...

# Copy compiled code for API and all internal packages
COPY --from=build /app/apps/api/dist/ ./apps/api/dist
COPY --from=build /app/packages/logger/dist/ ./packages/logger/dist
COPY --from=build /app/packages/db/dist/ ./packages/db/dist
COPY --from=build /app/packages/evm/dist/ ./packages/evm/dist

# Create logs and state directories
RUN mkdir -p /app/apps/api/logs /app/state

# Run as non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S api -u 1001

# Change ownership of app directory
RUN chown -R api:nodejs /app
USER api

# Switch to API directory
WORKDIR /app/apps/api

# Health check - verify the API file exists and is executable
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD test -f dist/index.js && node --check dist/index.js || exit 1

# Default command
CMD ["node", "dist/index.js"]
