#!/bin/bash

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

set -e

WASM_FILE="static/wasm/technicals_wasm.wasm"

WASM_FILE="static/wasm/technicals_wasm.wasm"

# We removed the "skip if exists" check to ensure Rust source changes are always 
# compiled when cargo is available. Cargo handles incremental builds efficiently.

# Check if cargo is available
if ! command -v cargo > /dev/null 2>&1; then
    echo "⚠ Cargo not found. Skipping WASM build."
    echo "  Using pre-compiled WASM binary if available."
    exit 0
fi

# Check if wasm32-unknown-unknown target is installed
if ! rustup target list | grep -q "wasm32-unknown-unknown (installed)"; then
    echo "⚠ wasm32-unknown-unknown target not installed."
    echo "  Run: rustup target add wasm32-unknown-unknown"
    echo "  Skipping WASM build for now."
    exit 0
fi

echo "Building WASM module..."
cd technicals-wasm
cargo build --release --target wasm32-unknown-unknown

echo "Generating bindings..."
# Since we don't have wasm-pack installed in this environment to generate the glue JS automatically,
# we are relying on the manual glue code in src/utils/wasmTechnicals.ts which simulates the interface.
# In a real environment, we would run:
# wasm-pack build --target web --out-dir ../src/wasm

# For this environment, we just copy the .wasm file to public so it can be fetched.
mkdir -p ../static/wasm
cp target/wasm32-unknown-unknown/release/technicals_wasm.wasm ../static/wasm/

echo "✓ WASM build complete. Artifacts in static/wasm/"
