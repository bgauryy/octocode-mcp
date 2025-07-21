#!/bin/bash

# Script to run octocode-mcp in Docker with proper GitHub CLI configuration

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Octocode MCP in Docker...${NC}"

# Check if GitHub CLI is authenticated on host
if ! gh auth status >/dev/null 2>&1; then
    echo -e "${RED}Error: GitHub CLI is not authenticated on host.${NC}"
    echo -e "${YELLOW}Please run 'gh auth login' first.${NC}"
    exit 1
fi

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Build the Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t octocode-mcp:latest -f "$SCRIPT_DIR/Dockerfile" "$PROJECT_ROOT"

# Run the container with mounted configurations
echo -e "${YELLOW}Starting container with GitHub CLI configuration...${NC}"
docker run -it \
    --name octocode-mcp \
    --rm \
    -v ~/.config/gh:/home/nodejs/.config/gh:ro \
    -v ~/.gitconfig:/home/nodejs/.gitconfig:ro \
    -v ~/.ssh:/home/nodejs/.ssh:ro \
    -v ~/.npmrc:/home/nodejs/.npmrc:ro \
    --network host \
    octocode-mcp:latest

echo -e "${GREEN}Container stopped.${NC}"