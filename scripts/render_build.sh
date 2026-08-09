#!/bin/bash
# Render Build Script
#
# Fallback build script for Render deployment.

echo "Installing dependencies..."
npm install --include=optional

echo "Building application..."
npm run build
