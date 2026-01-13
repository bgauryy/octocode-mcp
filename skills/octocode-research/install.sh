#!/usr/bin/env bash
#
# Install script for octocode-research
# Checks for existing installation and installs only if needed
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for required tools
check_requirements() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not installed"
        exit 1
    fi
    
    if ! command -v yarn &> /dev/null && ! command -v npm &> /dev/null; then
        log_error "yarn or npm is required but not installed"
        exit 1
    fi
}

# Check if already installed
is_installed() {
    # Check workspace root node_modules (monorepo)
    if [[ -d "../../node_modules" ]]; then
        return 0
    fi
    # Check local node_modules
    if [[ -d "./node_modules" ]]; then
        return 0
    fi
    return 1
}

# Detect package manager
detect_package_manager() {
    if [[ -f "../../yarn.lock" ]] || command -v yarn &> /dev/null; then
        echo "yarn"
    else
        echo "npm"
    fi
}

# Main
main() {
    check_requirements
    
    # Check if already installed
    if is_installed; then
        log_info "Already installed (node_modules exists) ✓"
        exit 0
    fi
    
    log_info "Installing octocode-research..."
    
    local pkg_manager
    pkg_manager=$(detect_package_manager)
    
    # Install from workspace root if monorepo
    if [[ -f "../../package.json" ]]; then
        log_info "Installing from workspace root..."
        (cd ../.. && $pkg_manager install)
    else
        $pkg_manager install
    fi
    
    # Build
    log_info "Building..."
    $pkg_manager run build
    
    log_info "Installation complete! ✓"
}

main "$@"
