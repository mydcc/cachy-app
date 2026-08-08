#!/bin/bash
# Fallback build script for Render Dashboard Override
echo "Running standard npm install and build..."
npm install --include=optional
npm run build
