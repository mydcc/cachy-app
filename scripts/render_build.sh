#!/bin/bash
set -e
rm -rf node_modules package-lock.json
# Ensure optional dependencies are installed for rolldown bindings, ignoring errors on failures
npm install --no-audit --no-fund --include=optional || true
npm run build
