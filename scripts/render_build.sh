#!/usr/bin/env bash
# Fallback build script for Render CI/CD
echo "Running Render build..."
npm install --include=optional
npm run build
