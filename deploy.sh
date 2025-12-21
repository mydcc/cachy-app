#!/bin/bash

# Deploy script for Cachy App

# 1. Configuration & Setup
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

# 2. Stop the application to free up RAM for the build
echo "Stopping PM2 process '$APP_NAME' to free up RAM..."
pm2 stop $APP_NAME || echo "Process '$APP_NAME' not running or not found. Continuing..."

# 3. Pull latest changes (with reset to avoid conflicts)
echo "Pulling latest changes..."
git reset --hard HEAD
git pull

# 4. Install dependencies (in case package.json changed)
echo "Installing dependencies..."
npm install

# 5. Build the application
echo "Building application..."
npm run build

# 6. Fix permissions (Important for Nginx/aaPanel)
# Ensures www user can read the new build files
echo "Fixing permissions..."
chown -R www:www .

# 7. Restart the application process
echo "Restarting PM2 process '$APP_NAME'..."
pm2 restart $APP_NAME --update-env || echo "Failed to restart PM2 process '$APP_NAME'. Please check the name."

echo "Deployment complete."
