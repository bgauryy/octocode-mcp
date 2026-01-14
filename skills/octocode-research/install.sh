#!/usr/bin/env bash
#
# Install and start octocode-research server
# Server runs on http://localhost:1987
#
# Works in both monorepo and standalone installations
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PORT=1987
# Cross-platform temp directory
TMP_DIR="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"
PID_FILE="$TMP_DIR/octocode-research.pid"
LOG_FILE="$TMP_DIR/octocode-research.log"
# Cross-platform: HOME (Linux/Mac) or USERPROFILE (Windows)
OCTOCODE_LOGS_DIR="${HOME:-$USERPROFILE}/.octocode/logs"

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_server() { echo -e "${CYAN}[SERVER]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

check_requirements() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not installed"
        exit 1
    fi

    local node_version
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$node_version" -lt 20 ]]; then
        log_error "Node.js 20+ required (found: $(node -v))"
        exit 1
    fi
}

# Check if OUR server is running (via health endpoint)
is_our_server_running() {
    if curl -s --connect-timeout 2 "http://localhost:$PORT/health" > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Check if we have a valid PID (process exists)
is_pid_valid() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
        # Stale PID file - clean it up
        rm -f "$PID_FILE"
    fi
    return 1
}

# Check if port is occupied by another process
is_port_occupied() {
    if lsof -i :$PORT &>/dev/null 2>&1; then
        return 0
    fi
    return 1
}

stop_server() {
    # First try to stop via PID file
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Stopping existing server (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 1
        fi
        rm -f "$PID_FILE"
    fi
    # Kill any process on the port (only if it was ours)
    local port_pid
    port_pid=$(lsof -ti :$PORT 2>/dev/null || true)
    if [[ -n "$port_pid" ]]; then
        kill "$port_pid" 2>/dev/null || true
    fi
}

is_monorepo() {
    # Check if we're in the octocode-mcp monorepo
    [[ -f "../../package.json" ]] && [[ -f "../../yarn.lock" ]] && grep -q '"octocode-mcp"' "../../package.json" 2>/dev/null
}

install_dependencies() {
    # Check if dist already exists (pre-built)
    if [[ -d "./dist" ]] && [[ -f "./dist/server.js" ]]; then
        log_info "Using pre-built distribution..."
        
        # Only install if node_modules missing
        if [[ ! -d "./node_modules" ]]; then
            log_info "Installing runtime dependencies..."
            npm install --omit=dev --quiet 2>/dev/null || npm install --production --quiet
        fi
        return 0
    fi
    
    # Need to build - determine if monorepo or standalone
    if is_monorepo; then
        log_info "Detected monorepo installation..."
        
        # Install from workspace root
        if [[ ! -d "../../node_modules" ]]; then
            log_info "Installing from workspace root..."
            (cd ../.. && yarn install)
        fi
        
        # Build using yarn
        log_info "Building..."
        yarn run build
    else
        log_info "Detected standalone installation..."
        
        # Standalone: use npm
        if [[ ! -d "./node_modules" ]]; then
            log_info "Installing dependencies with npm..."
            npm install
        fi
        
        # Build
        log_info "Building..."
        npm run build
    fi
}

start_server() {
    # Clear logs on fresh start
    rm -rf "$OCTOCODE_LOGS_DIR"/*.log 2>/dev/null || true
    > "$LOG_FILE"
    
    log_server "Starting Octocode Research Server on port $PORT..."

    # Start server in background
    nohup node dist/server.js > "$LOG_FILE" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"

    # Wait for server to be ready
    local retries=15
    while [[ $retries -gt 0 ]]; do
        if curl -s "http://localhost:$PORT/health" > /dev/null 2>&1; then
            log_server "Server started successfully! (PID: $pid)"
            log_server "Health check: http://localhost:$PORT/health"
            echo ""
            log_info "API ready at http://localhost:$PORT"
            return 0
        fi
        sleep 0.5
        ((retries--))
    done

    log_error "Server failed to start. Check logs:"
    cat "$LOG_FILE" 2>/dev/null || true
    exit 1
}

show_usage() {
    echo ""
    echo "🔍 Octocode Research Server - HTTP API on port $PORT"
    echo ""
    echo "Usage: ./install.sh [command]"
    echo ""
    echo "Commands:"
    echo "  health    ⚠️  Check if server is running (DO THIS FIRST!)"
    echo "  start     Start server (install if needed) [default]"
    echo "  stop      Stop running server"
    echo "  restart   Restart server"
    echo "  status    Check detailed server status"
    echo "  logs      Show server logs"
    echo "  build     Build without starting"
    echo ""
    echo "⚠️  IMPORTANT: Always check health before making API calls!"
    echo ""
    echo "Quick Start:"
    echo "  ./install.sh health      # Check if running first!"
    echo "  ./install.sh start       # Start if not running"
    echo "  curl http://localhost:$PORT/health"
    echo ""
    echo "API Routes:"
    echo "  GET /health              - Server health check"
    echo "  GET /local/search        - Search code (pattern, path)"
    echo "  GET /local/content       - Read file (path)"
    echo "  GET /local/structure     - View directory (path)"
    echo "  GET /lsp/definition      - Go to definition"
    echo "  GET /lsp/references      - Find references"
    echo "  GET /lsp/calls           - Call hierarchy"
    echo "  GET /github/search       - Search GitHub code"
    echo "  GET /github/content      - Read GitHub files"
    echo "  GET /package/search      - Search npm/PyPI"
    echo ""
}

# Main
main() {
    local command="${1:-start}"

    case "$command" in
        health)
            # Quick health check - recommended before any API calls
            if curl -s --connect-timeout 2 "http://localhost:$PORT/health" 2>/dev/null; then
                echo ""  # newline after JSON
                exit 0
            else
                log_warn "Server is NOT running on port $PORT"
                log_info "Start with: ./install.sh start"
                exit 1
            fi
            ;;
        start)
            # Check if OUR server is already running (health check first!)
            if is_our_server_running; then
                log_info "Server already running on port $PORT"
                curl -s "http://localhost:$PORT/health" 2>/dev/null || true
                exit 0
            fi
            
            # Check if port is occupied by ANOTHER process
            if is_port_occupied; then
                log_error "Port $PORT is already in use by another process!"
                log_error "Check with: lsof -i :$PORT"
                log_info "Either stop that process or change PORT in this script"
                exit 1
            fi
            
            # Now safe to install and start
            check_requirements
            install_dependencies
            start_server
            ;;
        stop)
            stop_server
            log_info "Server stopped"
            ;;
        restart)
            stop_server
            sleep 1
            check_requirements
            install_dependencies
            start_server
            ;;
        status)
            if is_our_server_running; then
                log_info "Server is running on port $PORT"
                curl -s "http://localhost:$PORT/health" 2>/dev/null || true
            elif is_port_occupied; then
                log_warn "Port $PORT is in use, but NOT by our server!"
                log_info "Check with: lsof -i :$PORT"
            elif is_pid_valid; then
                log_warn "PID file exists but server not responding"
                log_info "Try: ./install.sh restart"
            else
                log_warn "Server is not running"
                log_info "Start with: ./install.sh start"
            fi
            ;;
        logs)
            if [[ -f "$LOG_FILE" ]]; then
                tail -f "$LOG_FILE"
            else
                log_warn "No logs found at $LOG_FILE"
            fi
            ;;
        build)
            check_requirements
            install_dependencies
            log_info "Build complete"
            ;;
        --help|-h|help)
            show_usage
            ;;
        *)
            log_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
