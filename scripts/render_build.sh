#!/usr/bin/env bash

# Workaround for npm bug 4828 preventing rolldown install on Render
npm ci --include=optional --include=dev
npm run build
