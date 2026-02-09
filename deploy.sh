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

# Colors (256-color palette for Cachy Cool UI)
readonly RED='\033[38;5;196m'
readonly GREEN='\033[38;5;46m'
readonly YELLOW='\033[38;5;226m'
readonly GOLD='\033[38;5;220m'
readonly CYAN='\033[38;5;51m'
readonly LIME='\033[38;5;118m'
readonly GREY='\033[38;5;244m'
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
    # Better ANSI strip for all color types
    local clean_message=$(echo -e "$message" | sed 's/\x1b\[[0-9;]*[mGJKHF]//g')
    echo "[$timestamp] $clean_message" >> "$LOG_FILE" 2>/dev/null || true
    echo -e "${GREY}[$timestamp]${NC} $message"
}

error_exit() {
    local message="$1"
    log "${RED}ERROR: $message${NC}"
    notify_deployment_failure "$ENVIRONMENT" "$message" 2>/dev/null || true
    exit 1
}

prompt_user() {
    local message="$1"
    echo -e "${YELLOW}❓ $message (y/n)${NC}"
    read -p "> " -n 1 -r
    echo ""
    [[ $REPLY =~ ^[Yy]$ ]]
}

show_cachy_eater() {
    local pid=$1
    local estimate=$2
    local delay=0.5
    local width=40
    local char="c"
    local gold='\033[38;2;255;215;0m'
    local dimmed='\033[2m'
    
    # Hide cursor
    tput civis 2>/dev/null || echo -ne "\033[?25l"
    
    local start_time=$(date +%s)
    while kill -0 $pid 2>/dev/null; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        # Calculate progress position (0 to width-1)
        # We cap it at width-1 to never let the eater leave the bar prematurely
        local pos=$(( elapsed * width / estimate ))
        [[ $pos -ge $width ]] && pos=$((width - 1))
        
        # Toggle mouth
        [[ "$char" == "c" ]] && char="C" || char="c"
        
        # Build the bar components
        local spaces=""
        for ((i=0; i<pos; i++)); do spaces+=" "; done
        
        local dots=""
        for ((i=pos+1; i<width; i++)); do dots+="•"; done
        
        # Print bar: Only c/C is gold
        printf "\r  ${YELLOW}[${NC}${spaces}${gold}${char}${NC}${dots}${YELLOW}]${NC} Building... "
        
        sleep $delay
    done
    
    # Show cursor again
    tput cnorm 2>/dev/null || echo -ne "\033[?25h"
    printf "\r"
    # Clear line
    printf "                                                                \r"
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
    
    # Safety Check: Fallback if URL is empty
    if [[ -z "$url" ]]; then
        url="http://localhost:$PORT/api/health"
    fi
    
    log "Running health check on $url (Waiting up to 30s)..."
    local count=0
    while [[ $count -lt 30 ]]; do
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

# Change to project root to allow execution from anywhere
cd "$SCRIPT_DIR" || error_exit "Could not enter script directory"

clear
echo -e "${GOLD}"
cat << "EOF"
  ____           _            
 / ___|__ _  ___| |__  _   _  
| |   / _` |/ __| '_ \| | | | 
| |__| (_| | (__| | | | |_| | 
 \____\__,_|\___|_| |_|\__, | 
                       |___/  
EOF
echo -e "${NC}"
echo -e "${CYAN}┌──────────────────────────────────────────┐${NC}"
printf "${CYAN}│   🚀 DEPLOYMENT: %-23s │\n${NC}" "$(echo $ENV_TYPE | tr '[:lower:]' '[:upper:]')"
echo -e "${CYAN}└──────────────────────────────────────────┘${NC}"
echo ""

# Pre-flight Check: Branch & State
[[ ! -d ".git" ]] && error_exit "Not a git repository"
CURRENT_BRANCH=$(git branch --show-current)
log "Target Environment: ${LIME}$ENVIRONMENT${NC}"
log "Current Branch: ${YELLOW}$CURRENT_BRANCH${NC}"

# ... (rest of pre-flight)

# 1. Smart Branch Switching
if [[ "$CURRENT_BRANCH" != "$TARGET_BRANCH" ]]; then
    if prompt_user "Wrong branch! Should I switch to ${GREEN}$TARGET_BRANCH${NC} for you?"; then
        # Check for dirty state before switching to be safe
        if ! git diff-index --quiet HEAD --; then
             if prompt_user "Your branch is dirty. Should I stash your changes before switching?"; then
                 git stash || error_exit "Stashing failed"
             else
                 error_exit "Cannot switch branches with uncommitted changes."
             fi
        fi
        git checkout "$TARGET_BRANCH" || error_exit "Could not switch to $TARGET_BRANCH"
        CURRENT_BRANCH=$(git branch --show-current)
    else
        error_exit "Mode $ENV_TYPE requires branch '$TARGET_BRANCH'."
    fi
fi

# 2. Smart Stashing (if still dirty)
if ! git diff-index --quiet HEAD --; then
    if prompt_user "Dirty Git state detected. Should I stash your changes for deployment?"; then
        git stash || error_exit "Stashing failed"
    else
        error_exit "Please commit or stash changes before deploying."
    fi
fi

if [[ "$ENV_TYPE" == "stable" ]]; then
    echo -e "${RED}⚠️  PROD-DEPLOYMENT: Proceed? (y/n)${NC}"
    read -p "> " -n 1 -r
    echo ""
    [[ ! $REPLY =~ ^[Yy]$ ]] && error_exit "Cancelled by user"
fi

notify_deployment_start "$ENVIRONMENT" "${USER:-root}" 2>/dev/null || true

# 1. Update Source
log "${CYAN}[SYNC]${NC} Updating source via Git..."
git reset --hard HEAD || error_exit "Git reset failed"
git pull || error_exit "Git pull failed"

# 2. Backup
log "${CYAN}[BACKUP]${NC} Securing current state..."
create_backup "$ENV_TYPE"

# 3. Atomic Build
log "${CYAN}[BUILD]${NC} Building in shadow directory (Atomic)..."
notify_build_start 2>/dev/null || true
BUILD_START_TIME=$(date +%s)
WORK_DIR_TMP="$SCRIPT_DIR/.deploy_work"
BUILD_LOG="$LOG_DIR/build_$(date +%Y%m%d_%H%M%S).log"
LAST_TIME_FILE="$SCRIPT_DIR/.last_build_time"

# Read last build duration as estimate
ESTIMATE=60
[[ -f "$LAST_TIME_FILE" ]] && ESTIMATE=$(cat "$LAST_TIME_FILE")
[[ $ESTIMATE -lt 10 ]] && ESTIMATE=60 # Sanity check

rm -rf "$WORK_DIR_TMP"
mkdir -p "$WORK_DIR_TMP"
rsync -aq --exclude '.deploy_work' --exclude 'node_modules' --exclude 'build' --exclude '.git' ./ "$WORK_DIR_TMP/"

# Run build in background and show eater
(cd "$WORK_DIR_TMP" && npm ci --legacy-peer-deps && npm run build) > "$BUILD_LOG" 2>&1 &
BUILD_PID=$!
show_cachy_eater $BUILD_PID $ESTIMATE

if ! wait $BUILD_PID; then
    notify_build_failure "Build process failed" 2>/dev/null || true
    echo -e "${RED}❌ BUILD FAILED!${NC}"
    echo -e "${YELLOW}--- Last 15 lines of build log ---${NC}"
    tail -n 15 "$BUILD_LOG"
    echo -e "${YELLOW}----------------------------------${NC}"
    log "Full build log available at: $BUILD_LOG"
    rm -rf "$WORK_DIR_TMP"
    error_exit "Build failed. Production was not affected."
fi

if [[ ! -f "$WORK_DIR_TMP/build/index.js" ]]; then
    error_exit "Build artifact validation failed"
fi

BUILD_DURATION=$(( $(date +%s) - BUILD_START_TIME ))
echo "$BUILD_DURATION" > "$LAST_TIME_FILE"
log "Build successful in ${BUILD_DURATION}s (Log: $BUILD_LOG)"
notify_build_success "${BUILD_DURATION}s" 2>/dev/null || true

# 4. Permissions & Swap
log "${CYAN}[SWAP]${NC} Setting permissions and swapping build..."
chown -R www:www "$WORK_DIR_TMP/build" 2>/dev/null || true
chmod -R 755 "$WORK_DIR_TMP/build" 2>/dev/null || true

[[ -d "build" ]] && mv build "build_old_$(date +%s)"
mv "$WORK_DIR_TMP/build" ./
rm -rf "$WORK_DIR_TMP"

# 5. Restart & Health
log "${CYAN}[HEALTH]${NC} Restarting service and health check..."
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
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                                  ║${NC}"
printf "${CYAN}║   ${LIME}✅  DEPLOYMENT %-44s ${CYAN}║\n${NC}" "$(echo "$ENV_TYPE" | tr '[:lower:]' '[:upper:]') ERFOLGREICH"
echo -e "${CYAN}║                                                                  ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║                                                                  ║${NC}"
printf "${CYAN}║   Environment:  ${LIME}%-48s ${CYAN}║\n${NC}" "$ENVIRONMENT"
printf "${CYAN}║   Dauer:        ${LIME}%-48s ${CYAN}║\n${NC}" "${DURATION_MIN}m ${DURATION_SEC}s"
printf "${CYAN}║   Zeitpunkt:    ${LIME}%-48s ${CYAN}║\n${NC}" "$(date '+%Y-%m-%d %H:%M:%S')"
echo -e "${CYAN}║                                                                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

log "${LIME}Deployment completed successfully in ${DURATION_MIN}m ${DURATION_SEC}s${NC}"
notify_deployment_success "$ENVIRONMENT" "${DURATION_MIN}m ${DURATION_SEC}s" 2>/dev/null || true
