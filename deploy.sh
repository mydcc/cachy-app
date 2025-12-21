#!/bin/bash

# Deploy script for Cachy App

# 1. Pull latest changes (with reset to avoid conflicts)
echo "Pulling latest changes..."
git reset --hard HEAD
git pull

# 2. Install dependencies (in case package.json changed)
echo "Installing dependencies..."
npm install

# 3. Build the application
echo "Building application..."
npm run build

# 4. Fix permissions (Important for Nginx/aaPanel)
# Ensures www user can read the new build files
echo "Fixing permissions..."
chown -R www:www .

# 5. Restart the application process
# Note: This assumes the process is named 'cachy-app' or 'devcachyapp' or similar.
# We try to detect or use a passed argument, defaulting to 'cachy-app'.

APP_NAME=$1
if [ -z "$APP_NAME" ]; then
    APP_NAME="cachy-app"
    echo "No app name provided, defaulting to '$APP_NAME'."
    echo "Usage: ./deploy.sh [app_name]"
fi

# Set default ports based on app name to avoid conflicts if env var is missing
if [ "$APP_NAME" = "devcachyapp" ]; then
    export PORT=3002
    echo "Dev environment detected. Enforcing PORT=$PORT"
elif [ "$APP_NAME" = "cachy-app" ] || [ "$APP_NAME" = "prodcachyapp" ]; then
    export PORT=3001
    echo "Production environment detected. Enforcing PORT=$PORT"
fi

echo "Restarting PM2 process '$APP_NAME'..."
pm2 restart $APP_NAME --update-env || echo "Failed to restart PM2 process '$APP_NAME'. Please check the name."

echo "Deployment complete."
