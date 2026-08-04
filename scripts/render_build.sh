#!/bin/bash
# Fallback build script for Render Dashboard Override Trap
set -e

echo "Running standard npm install..."
npm install --include=optional

echo "Running standard build..."
npm run build
