#!/bin/bash
# MCP wrapper script for Docker

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Ensure image is built
if ! docker images | grep -q "octocode-mcp.*latest"; then
    echo "Building Docker image..." >&2
    docker build -t octocode-mcp:latest -f "$SCRIPT_DIR/Dockerfile" "$PROJECT_ROOT" >&2
fi

# Run container in interactive mode for MCP
exec docker run -i --rm \
    -v ~/.config/gh:/home/nodejs/.config/gh:ro \
    -v ~/.gitconfig:/home/nodejs/.gitconfig:ro \
    -v ~/.ssh:/home/nodejs/.ssh:ro \
    -v ~/.npmrc:/home/nodejs/.npmrc:ro \
    --network host \
    octocode-mcp:latest