# syntax=docker/dockerfile:1

# Multi-stage build for smaller production image
FROM node:18-alpine AS builder

WORKDIR /app

# Install OS deps commonly needed by tooling
RUN apk add --no-cache bash git openssh

# Copy only package files first for better layer caching
COPY packages/octocode-mcp/package.json ./package.json
COPY packages/octocode-mcp/yarn.lock ./yarn.lock

# Install dependencies (including dev deps for build)
RUN yarn install --frozen-lockfile

# Copy source
COPY packages/octocode-mcp/ .

# Build the package (outputs to dist/)
RUN yarn build

### Runtime image
FROM node:18-alpine AS runtime

WORKDIR /app

# Create non-root user for security
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Copy built artifacts and necessary runtime files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/manifest.json ./manifest.json

# Install production dependencies only
RUN yarn install --production --frozen-lockfile && yarn cache clean

# Environment configuration (tokens must be provided at runtime)
ENV NODE_ENV=production

# Use non-root user
USER nodejs

# Default command runs the MCP server over stdio
CMD ["node", "dist/index.js"]


