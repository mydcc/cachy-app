#!/bin/bash
rm -rf node_modules package-lock.json
PUPPETEER_SKIP_DOWNLOAD=true npm install --include=optional --include=dev
npm run build
