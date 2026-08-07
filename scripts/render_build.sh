#!/bin/bash
set -e
rm -rf node_modules package-lock.json
npm install --include=optional
npm run build
