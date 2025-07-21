# Use Node.js 18 LTS (less than 20 as required)
FROM node:18-alpine

# Install GitHub CLI
RUN apk add --no-cache \
    github-cli \
    git \
    bash

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy application files
COPY . .

# Build the application
RUN yarn build

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set up GitHub CLI config directory
RUN mkdir -p /home/nodejs/.config && \
    chown -R nodejs:nodejs /home/nodejs

# Switch to non-root user
USER nodejs

# The GitHub CLI config will be mounted from host at runtime
# Mount points:
# - ~/.config/gh:/home/nodejs/.config/gh (GitHub CLI config)
# - ~/.gitconfig:/home/nodejs/.gitconfig (Git config)

# Expose the MCP server
EXPOSE 3000

# Start the MCP server
CMD ["node", "dist/index.js"]