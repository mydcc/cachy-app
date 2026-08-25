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

# Do not exit immediately on error, handle them gracefully
set +e

WASM_FILE="static/wasm/technicals_wasm.wasm"

echo "Checking WASM build requirements..."

# Check for technicals-wasm directory
if [[ ! -d "technicals-wasm" ]]; then
    echo "⚠ 'technicals-wasm' directory not found. Skipping WASM build."
    exit 0
fi

# Check if cargo is available
if ! command -v cargo > /dev/null 2>&1; then
    echo "⚠ Cargo not found. Skipping WASM build."
    echo "  Using pre-compiled WASM binary if available."
    exit 0
fi

# Check if rustup is available before trying to use it
if ! command -v rustup > /dev/null 2>&1; then
    echo "⚠ Rustup not found. Skipping WASM target check."
    # If rustup is missing, we assume the environment might be a bare rustc setup
    # We skip to be safe on restricted envs like Render unless explicitly configured
    echo "  Skipping WASM build for now (rustup required for target check)."
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
if ! cargo build --release --target wasm32-unknown-unknown; then
    echo "⚠ Cargo build failed. Skipping WASM update."
    echo "  Continuing with existing artifacts if present."
    exit 0
fi
cd ..

TARGET_WASM="technicals-wasm/target/wasm32-unknown-unknown/release/technicals_wasm.wasm"

if [[ ! -f "$TARGET_WASM" ]]; then
    echo "⚠ WASM artifact not found after build."
    exit 0
fi

# Generate real bindings with wasm-bindgen. The committed glue in
# static/wasm/ (technicals_wasm.js/.d.ts/_bg.wasm) is only valid together as
# one generated trio — a raw cargo binary copied next to an older glue will
# not even instantiate (missing __wbindgen_* imports), which is exactly the
# silent drift BUG-0313 was filed for.
mkdir -p static/wasm

BINDGEN_VERSION="$(cargo metadata --format-version 1 --manifest-path technicals-wasm/Cargo.toml 2>/dev/null | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try { const m=JSON.parse(d); const p=m.packages.find(p=>p.name==='wasm-bindgen'); console.log(p?p.version:''); } catch { console.log(''); }
})")"

if ! command -v wasm-bindgen > /dev/null 2>&1; then
    echo "⚠ wasm-bindgen not found. Keeping existing artifacts."
    echo "  Install the matching version: cargo install wasm-bindgen-cli --version ${BINDGEN_VERSION:-<version from technicals-wasm/Cargo.toml>}"
    exit 0
fi

INSTALLED_VERSION="$(wasm-bindgen --version | awk '{print $2}')"
if [[ -n "$BINDGEN_VERSION" && "$INSTALLED_VERSION" != "$BINDGEN_VERSION" ]]; then
    echo "⚠ wasm-bindgen version mismatch: installed $INSTALLED_VERSION, crate uses $BINDGEN_VERSION."
    echo "  The generated trio would not be ABI-consistent. Keeping existing artifacts."
    echo "  Fix with: cargo install wasm-bindgen-cli --version $BINDGEN_VERSION"
    exit 0
fi

echo "Generating bindings (wasm-bindgen $INSTALLED_VERSION)..."
if wasm-bindgen --target web --out-dir static/wasm --out-name technicals_wasm "$TARGET_WASM"; then
    echo "✓ Bindings generated: static/wasm/technicals_wasm{,_bg.wasm,.d.ts}"
    echo "✓ WASM build complete."
else
    echo "⚠ wasm-bindgen failed. Keeping existing artifacts."
    exit 0
fi
