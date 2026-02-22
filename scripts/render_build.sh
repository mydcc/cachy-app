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
# Print commands for debugging
set -x

echo "Build script started."

# Ensure execution permissions for build scripts
chmod +x ./scripts/build_wasm.sh

# Ensure Cargo is available
if ! command -v cargo &> /dev/null; then
    if [ -f "$HOME/.cargo/env" ]; then
        echo "Loading cargo from ~/.cargo/env"
        . "$HOME/.cargo/env"
    fi
fi

if ! command -v cargo &> /dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    . "$HOME/.cargo/env"
else
    echo "Rust/Cargo is already available."
fi

echo "Ensuring wasm32-unknown-unknown target..."
rustup target add wasm32-unknown-unknown

echo "Cleaning up node_modules to ensure clean state..."
rm -rf node_modules

echo "Installing Node dependencies with npm install (ignoring lockfile strictness)..."
npm install

echo "Rebuilding native modules..."
npm rebuild

echo "Building application..."
npm run build
