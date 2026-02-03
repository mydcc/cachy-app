#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "Installing Rust..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env

echo "Adding wasm target..."
rustup target add wasm32-unknown-unknown

echo "Installing Node dependencies..."
npm install

echo "Building..."
npm run build
