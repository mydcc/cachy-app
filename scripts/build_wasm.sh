#!/bin/bash
set -e

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

echo "WASM build complete. Artifacts in static/wasm/"
