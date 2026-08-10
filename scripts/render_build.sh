#!/bin/bash
set -e

echo "Running Render build script fallback..."
npm install
npm run build
