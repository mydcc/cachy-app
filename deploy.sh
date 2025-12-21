#!/bin/bash

# Deploy script for Cachy App

# 1. Pull latest changes
echo "Pulling latest changes..."
git pull

# 2. Install dependencies (in case package.json changed)
echo "Installing dependencies..."
npm install

# 3. Build the application
echo "Building application..."
npm run build

# 4. Restart the application process
# Note: This assumes the process is named 'cachy-app' or 'devcachyapp' or similar.
# We try to detect or use a passed argument, defaulting to 'cachy-app'.

APP_NAME=$1
if [ -z "$APP_NAME" ]; then
    APP_NAME="cachy-app"
    echo "No app name provided, defaulting to '$APP_NAME'."
    echo "Usage: ./deploy.sh [app_name]"
fi

echo "Restarting PM2 process '$APP_NAME'..."
pm2 restart $APP_NAME --update-env || echo "Failed to restart PM2 process '$APP_NAME'. Please check the name."

echo "Deployment complete."
