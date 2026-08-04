#!/bin/bash
# Temporary fallback for Render dashboard override trap
echo "Running fallback render_build.sh script..."
npm install --include=optional
npm run build
