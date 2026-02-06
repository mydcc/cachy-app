#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "Installing Rust..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env

echo "Adding wasm target..."
rustup target add wasm32-unknown-unknown

echo "Installing Node dependencies..."
# Ensure dev dependencies (vite, svelte-kit) are installed even if NODE_ENV=production
npm install --include=dev

echo "Building..."
npm run build
