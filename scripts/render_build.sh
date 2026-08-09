#!/bin/bash
# Render Build Fallback Script
# Overrides in Render dashboard point here, but the file was missing.

# Ensure we install optional dependencies for rolldown/native bindings
npm install --include=optional

# Run the standard SvelteKit/Vite build
npm run build
