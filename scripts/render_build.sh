#!/bin/bash
# Render Build Script
#
# Fallback build script for Render deployment.

echo "Clearing cache for optional native modules..."
rm -rf node_modules package-lock.json

echo "Installing dependencies..."
npm install --include=optional

echo "Building application..."
npm run build
