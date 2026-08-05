#!/usr/bin/env bash
# Fallback build script for Render CI/CD to handle missing script errors
npm ci --include=dev
npm run build
