#!/usr/bin/env bash
#
# Quick start script for octocode-research server
# Delegates to install.sh
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/install.sh" start
