#!/usr/bin/env bash

# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Exit on error
set -o errexit

echo "Build script started."

# Ensure Cargo is available (Attempt only)
# We wrap this to avoid failing the entire build if Rustup fails,
# as WASM might already be committed in static/wasm
if ! command -v cargo &> /dev/null; then
    if [ -f "$HOME/.cargo/env" ]; then
        echo "Loading cargo from ~/.cargo/env"
        . "$HOME/.cargo/env"
    fi
fi

if ! command -v cargo &> /dev/null; then
    echo "Installing Rust..."
    # Allow failure here
    (curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y) || echo "Rust installation failed, proceeding without WASM rebuild."

    if [ -f "$HOME/.cargo/env" ]; then
        . "$HOME/.cargo/env"
    fi
else
    echo "Rust/Cargo is already available."
fi

if command -v rustup &> /dev/null; then
    echo "Ensuring wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown || echo "Failed to add WASM target, proceeding..."
fi

echo "Installing Node dependencies..."
# Use npm ci for reliable builds if lockfile exists, but fallback to install if CI fails
# This handles cases where lockfile version might slightly differ on Render's environment
if [ -f "package-lock.json" ]; then
    npm ci || (echo "npm ci failed, falling back to npm install..." && npm install)
else
    npm install
fi

echo "Building..."
npm run build
