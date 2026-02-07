#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "Build script started."

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

echo "Installing Node dependencies..."
# Use npm ci for reliable builds if lockfile exists
if [ -f "package-lock.json" ]; then
    npm ci
else
    npm install
fi

echo "Building..."
npm run build
