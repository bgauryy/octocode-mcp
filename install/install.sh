#!/usr/bin/env sh
set -eu

# Octocode MCP Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/bgauryy/octocode-mcp/main/install/install.sh | sh
#
# Environment variables:
#   VERSION     - Specific version to install (default: latest)
#   INSTALL_DIR - Installation directory (default: ~/.local/bin)

# Colors
BOLD="$(tput bold 2>/dev/null || printf '')"
RED="$(tput setaf 1 2>/dev/null || printf '')"
GREEN="$(tput setaf 2 2>/dev/null || printf '')"
YELLOW="$(tput setaf 3 2>/dev/null || printf '')"
BLUE="$(tput setaf 4 2>/dev/null || printf '')"
NO_COLOR="$(tput sgr0 2>/dev/null || printf '')"

# Configuration
GITHUB_REPO="bgauryy/octocode-mcp"
BINARY_NAME="octocode-mcp"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

info() { printf '%s\n' "${BOLD}${BLUE}>${NO_COLOR} $*"; }
warn() { printf '%s\n' "${YELLOW}! $*${NO_COLOR}"; }
error() { printf '%s\n' "${RED}x $*${NO_COLOR}" >&2; }
success() { printf '%s\n' "${GREEN}✓${NO_COLOR} $*"; }

has() { command -v "$1" 1>/dev/null 2>&1; }

detect_platform() {
  platform="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "${platform}" in
    linux) platform="linux" ;;
    darwin) platform="darwin" ;;
    msys_nt*|cygwin_nt*|mingw*) platform="windows" ;;
    *)
      error "Unsupported platform: ${platform}"
      error "Supported platforms: linux, darwin (macOS), windows"
      exit 1
      ;;
  esac
  printf '%s' "${platform}"
}

detect_arch() {
  arch="$(uname -m | tr '[:upper:]' '[:lower:]')"
  case "${arch}" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)
      error "Unsupported architecture: ${arch}"
      error "Supported architectures: x64, arm64"
      exit 1
      ;;
  esac
  printf '%s' "${arch}"
}

get_latest_version() {
  if has curl; then
    curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
  elif has wget; then
    wget -qO- "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
  else
    error "curl or wget is required to fetch version information"
    exit 1
  fi
}

download() {
  file="$1"
  url="$2"
  
  if has curl; then
    curl -fsSL --output "$file" "$url"
  elif has wget; then
    wget -qO "$file" "$url"
  else
    error "curl or wget is required for downloading"
    exit 1
  fi
}

print_config() {
  printf '\n'
  info "Configure your MCP client with:"
  printf '\n'
  printf '  %s\n' "${BOLD}${GREEN}{"
  printf '  %s\n' '  "mcpServers": {'
  printf '  %s\n' '    "octocode": {'
  printf '  %s\n' "      \"command\": \"${INSTALL_DIR}/${BINARY_NAME}\""
  printf '  %s\n' '    }'
  printf '  %s\n' '  }'
  printf '  %s\n' "}${NO_COLOR}"
  printf '\n'
  info "Or with GitHub token:"
  printf '\n'
  printf '  %s\n' "${BOLD}${GREEN}{"
  printf '  %s\n' '  "mcpServers": {'
  printf '  %s\n' '    "octocode": {'
  printf '  %s\n' "      \"command\": \"${INSTALL_DIR}/${BINARY_NAME}\","
  printf '  %s\n' '      "env": {'
  printf '  %s\n' '        "GITHUB_TOKEN": "ghp_your_token_here"'
  printf '  %s\n' '      }'
  printf '  %s\n' '    }'
  printf '  %s\n' '  }'
  printf '  %s\n' "}${NO_COLOR}"
  printf '\n'
}

# Main installation
main() {
  printf '\n'
  printf '  %s\n' "${BOLD}${BLUE}Octocode MCP Installer${NO_COLOR}"
  printf '\n'

  platform="$(detect_platform)"
  arch="$(detect_arch)"
  
  # Determine binary name based on platform
  if [ "$platform" = "windows" ]; then
    binary_file="${BINARY_NAME}-${platform}-${arch}.exe"
    final_name="${BINARY_NAME}.exe"
  else
    binary_file="${BINARY_NAME}-${platform}-${arch}"
    final_name="${BINARY_NAME}"
  fi
  
  # Get version
  if [ -z "${VERSION:-}" ]; then
    info "Fetching latest version..."
    VERSION="$(get_latest_version)"
  fi
  
  if [ -z "$VERSION" ]; then
    error "Could not determine latest version"
    error "Please check your internet connection or specify VERSION manually"
    exit 1
  fi
  
  info "Platform: ${BOLD}${platform}-${arch}${NO_COLOR}"
  info "Version: ${BOLD}${VERSION}${NO_COLOR}"
  info "Install directory: ${BOLD}${INSTALL_DIR}${NO_COLOR}"
  printf '\n'
  
  # Create install directory
  if [ ! -d "$INSTALL_DIR" ]; then
    info "Creating directory ${INSTALL_DIR}..."
    mkdir -p "$INSTALL_DIR"
  fi
  
  # Download URL
  download_url="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${binary_file}"
  
  info "Downloading from GitHub Releases..."
  
  # Download to temp file first
  tmp_file="$(mktemp)"
  if ! download "$tmp_file" "$download_url"; then
    rm -f "$tmp_file"
    error "Download failed!"
    error "URL: ${download_url}"
    error ""
    error "Please check:"
    error "  1. The version ${VERSION} exists"
    error "  2. Binary for ${platform}-${arch} is available"
    error "  3. Your internet connection"
    exit 1
  fi
  
  # Move to final location
  mv "$tmp_file" "${INSTALL_DIR}/${final_name}"
  
  # Make executable (not needed on Windows)
  if [ "$platform" != "windows" ]; then
    chmod +x "${INSTALL_DIR}/${final_name}"
  fi
  
  printf '\n'
  success "${BOLD}Octocode MCP ${VERSION}${NO_COLOR} installed successfully!"
  printf '\n'
  info "Binary location: ${BOLD}${INSTALL_DIR}/${final_name}${NO_COLOR}"
  
  # Check if in PATH
  case ":$PATH:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      printf '\n'
      warn "Note: ${INSTALL_DIR} is not in your PATH"
      info "Add it to your shell profile:"
      printf '\n'
      printf '  %s\n' "${BOLD}export PATH=\"\$PATH:${INSTALL_DIR}\"${NO_COLOR}"
      printf '\n'
      ;;
  esac
  
  print_config
  
  info "Documentation: ${BOLD}https://github.com/${GITHUB_REPO}${NO_COLOR}"
  printf '\n'
}

main "$@"

