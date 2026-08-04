#!/bin/bash
# Temporary fallback for Render dashboard override trap
echo "Running fallback render_build.sh script..."
rm -rf node_modules package-lock.json
npm install --include=optional
npm run build
