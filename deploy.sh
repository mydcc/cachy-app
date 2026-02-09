#!/bin/bash

# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Unified & Robust Deployment Script for Cachy
# Handles Stable (main) and Beta (develop) deployments with Atomic Swaps.

set -e

# --- 1. Configuration & Initial Setup ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="$SCRIPT_DIR/.deploy.conf"
START_TIME=$(date +%s)

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# --- 2. Load Configuration ---
if [[ ! -f "$CONF_FILE" ]]; then
    echo -e "${YELLOW}⚠️  No .deploy.conf found. Generating default from template...${NC}"
    if [[ -f "$SCRIPT_DIR/.deploy.conf.example" ]]; then
        cp "$SCRIPT_DIR/.deploy.conf.example" "$CONF_FILE"
    else
        # Minimal fallback config if template is missing
        cat <<EOF > "$CONF_FILE"
PROJECT_NAME="cachy.app"
BRANCH_STABLE="main"
BRANCH_BETA="develop"
STABLE_ENVIRONMENT="cachy.app"
STABLE_PORT=3001
STABLE_START_COMMAND="sudo -u www bash /www/server/nodejs/vhost/scripts/prodcachyapp.sh"
BETA_ENVIRONMENT="dev.cachy.app"
BETA_PORT=3002
BETA_START_COMMAND="sudo -u www bash /www/server/nodejs/vhost/scripts/devcachyapp.sh"
LOG_DIR="/var/log/cachy"
BACKUP_DIR="/backups/cachy"
MAX_BACKUPS=5
HEALTH_CHECK_URL="http://localhost:{{PORT}}/api/health"
EOF
    fi
    echo "Please check .deploy.conf and run again."
    exit 1
fi

source "$CONF_FILE"

# --- 3. Source Discord Notifications ---
if [[ -f "$SCRIPT_DIR/scripts/discord-notify.sh" ]]; then
    source "$SCRIPT_DIR/scripts/discord-notify.sh"
else
    # Mock functions if script missing to avoid errors
    notify_deployment_start() { :; }
    notify_deployment_success() { :; }
    notify_deployment_failure() { :; }
    notify_build_start() { :; }
    notify_build_success() { :; }
    notify_build_failure() { :; }
    notify_health_check_failed() { :; }
    notify_rollback() { :; }
fi

# --- 4. Helper Functions ---

log() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local clean_message=$(echo -e "$message" | sed 's/\x1b\[[0-9;]*m//g')
    echo "[$timestamp] $clean_message" >> "$LOG_FILE" 2>/dev/null || true
    echo -e "[$timestamp] $message"
}

error_exit() {
    local message="$1"
    log "${RED}ERROR: $message${NC}"
    notify_deployment_failure "$ENVIRONMENT" "$message" 2>/dev/null || true
    exit 1
}

create_backup() {
    local env_name="$1"
    local backup_path="$BACKUP_DIR/$env_name/$(date +%Y%m%d_%H%M%S)"
    log "Creating backup at $backup_path..."
    
    mkdir -p "$backup_path"
    [[ -d "build" ]] && cp -r build "$backup_path/" || log "Warning: No build to backup"
    [[ -f "package-lock.json" ]] && cp package-lock.json "$backup_path/"
    git rev-parse HEAD > "$backup_path/git-commit.txt" 2>/dev/null || echo "unknown" > "$backup_path/git-commit.txt"
    
    # Rotation
    local backup_count=$(find "$BACKUP_DIR/$env_name" -maxdepth 1 -type d | wc -l)
    if [[ $backup_count -gt ${MAX_BACKUPS:-5} ]]; then
        find "$BACKUP_DIR/$env_name" -maxdepth 1 -type d -printf '%T+ %p\n' | sort | head -n -${MAX_BACKUPS:-5} | cut -d' ' -f2- | xargs rm -rf
    fi
}

graceful_shutdown() {
    local port="$1"
    log "Shutting down service on port $port..."
    if command -v lsof >/dev/null 2>&1 && lsof -ti:$port > /dev/null 2>&1; then
        local pid=$(lsof -ti:$port)
        kill -SIGTERM $pid 2>/dev/null || true
        local count=0
        while [[ $count -lt 10 ]] && lsof -ti:$port > /dev/null 2>&1; do
            sleep 1
            count=$((count + 1))
        done
        [[ $count -eq 10 ]] && kill -SIGKILL $(lsof -ti:$port) 2>/dev/null || true
    fi
}

health_check() {
    local url="${1//\{\{PORT\}\}/$PORT}"
    log "Running health check on $url..."
    local count=0
    while [[ $count -lt 10 ]]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            log "${GREEN}Health check passed${NC}"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    return 1
}

# --- 5. Environment & Mode Selection ---
ENV_TYPE="stable"
if [[ "$1" == "--beta" ]]; then
    ENV_TYPE="beta"
fi

if [[ "$ENV_TYPE" == "stable" ]]; then
    ENVIRONMENT="$STABLE_ENVIRONMENT"
    TARGET_BRANCH="$BRANCH_STABLE"
    PORT="$STABLE_PORT"
    START_CMD="$STABLE_START_COMMAND"
else
    ENVIRONMENT="$BETA_ENVIRONMENT"
    TARGET_BRANCH="$BRANCH_BETA"
    PORT="$BETA_PORT"
    START_CMD="$BETA_START_COMMAND"
fi

LOG_FILE="$LOG_DIR/deploy_$(date +%Y%m%d).log"
mkdir -p "$LOG_DIR" 2>/dev/null || true

# --- 6. Main Process ---

clear
echo -e "${GREEN}┌──────────────────────────────────────────┐${NC}"
printf "${GREEN}│   🚀 DEPLOYMENT: %-23s │\n${NC}" "$(echo $ENV_TYPE | tr '[:lower:]' '[:upper:]')"
echo -e "${GREEN}└──────────────────────────────────────────┘${NC}"
echo ""

# Pre-flight
[[ ! -d ".git" ]] && error_exit "Not a git repository"
CURRENT_BRANCH=$(git branch --show-current)
log "Target Environment: ${GREEN}$ENVIRONMENT${NC}"
log "Current Branch: ${YELLOW}$CURRENT_BRANCH${NC}"

if [[ "$CURRENT_BRANCH" != "$TARGET_BRANCH" ]]; then
    error_exit "Mode $ENV_TYPE requires branch '$TARGET_BRANCH' (You are on $CURRENT_BRANCH)"
fi

if ! git diff-index --quiet HEAD --; then
    error_exit "Dirty Git state: Please commit or stash changes before deploying."
fi

if [[ "$ENV_TYPE" == "stable" ]]; then
    echo -e "${RED}⚠️  PROD-DEPLOYMENT: Proceed? (y/n)${NC}"
    read -p "> " -n 1 -r
    echo ""
    [[ ! $REPLY =~ ^[Yy]$ ]] && error_exit "Cancelled by user"
fi

notify_deployment_start "$ENVIRONMENT" "${USER:-root}" 2>/dev/null || true

# 1. Update Source
log "Step 1: Updating source via Git..."
git reset --hard HEAD || error_exit "Git reset failed"
git pull || error_exit "Git pull failed"

# 2. Backup
log "Step 2: Securing current state..."
create_backup "$ENV_TYPE"

# 3. Atomic Build
log "Step 3: Building in shadow directory (Atomic)..."
notify_build_start 2>/dev/null || true
BUILD_START_TIME=$(date +%s)
WORK_DIR_TMP="$SCRIPT_DIR/.deploy_work"

rm -rf "$WORK_DIR_TMP"
mkdir -p "$WORK_DIR_TMP"
rsync -aq --exclude '.deploy_work' --exclude 'node_modules' --exclude 'build' --exclude '.git' ./ "$WORK_DIR_TMP/"

if ! (cd "$WORK_DIR_TMP" && npm ci --legacy-peer-deps && npm run build) > /dev/null 2>&1; then
    notify_build_failure "Build process failed" 2>/dev/null || true
    rm -rf "$WORK_DIR_TMP"
    error_exit "Build failed. Production was not affected."
fi

if [[ ! -f "$WORK_DIR_TMP/build/index.js" ]]; then
    error_exit "Build artifact validation failed"
fi

BUILD_DURATION=$(( $(date +%s) - BUILD_START_TIME ))
notify_build_success "${BUILD_DURATION}s" 2>/dev/null || true

# 4. Permissions & Swap
log "Step 4: Setting permissions and swapping build..."
chown -R www:www "$WORK_DIR_TMP/build" 2>/dev/null || true
chmod -R 755 "$WORK_DIR_TMP/build" 2>/dev/null || true

[[ -d "build" ]] && mv build "build_old_$(date +%s)"
mv "$WORK_DIR_TMP/build" ./
rm -rf "$WORK_DIR_TMP"

# 5. Restart & Health
log "Step 5: Restarting service and health check..."
graceful_shutdown "$PORT"
eval "$START_CMD > /dev/null 2>&1 &"
sleep 2

if ! health_check "$(echo "$HEALTH_CHECK_URL" | sed "s/{{PORT}}/$PORT/")"; then
    notify_health_check_failed "$ENVIRONMENT" 2>/dev/null || true
    error_exit "Service is not responding after restart"
fi

# 6. Finalize
TOTAL_DURATION=$(( $(date +%s) - START_TIME ))
DURATION_MIN=$((TOTAL_DURATION / 60))
DURATION_SEC=$((TOTAL_DURATION % 60))

# Permissions for the final folder
chown -R www:www "$SCRIPT_DIR/build" 2>/dev/null || true

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                  ║${NC}"
printf "${GREEN}║   ✅  DEPLOYMENT %-44s ${GREEN}║\n${NC}" "$(echo "$ENV_TYPE" | tr '[:lower:]' '[:upper:]') ERFOLGREICH"
echo -e "${GREEN}║                                                                  ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                                  ║${NC}"
printf "${GREEN}║   Environment:  %-48s ║\n${NC}" "$ENVIRONMENT"
printf "${GREEN}║   Dauer:        %-48s ║\n${NC}" "${DURATION_MIN}m ${DURATION_SEC}s"
printf "${GREEN}║   Zeitpunkt:    %-48s ║\n${NC}" "$(date '+%Y-%m-%d %H:%M:%S')"
echo -e "${GREEN}║                                                                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

log "Deployment completed successfully in ${DURATION_MIN}m ${DURATION_SEC}s"
notify_deployment_success "$ENVIRONMENT" "${DURATION_MIN}m ${DURATION_SEC}s" 2>/dev/null || true
