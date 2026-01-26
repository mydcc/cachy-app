#!/bin/bash
set -e  # Exit on error

# Configuration
readonly ENVIRONMENT="dev.cachy.app"
readonly PORT=3002
readonly WORK_DIR="/www/wwwroot/dev.cachy.app"
readonly BACKUP_DIR="/backups/cachy/dev"
readonly LOCK_FILE="/tmp/cachy_deploy_dev.lock"
readonly LOG_DIR="/var/log/cachy"
readonly MAX_BACKUPS=5
readonly HEALTH_CHECK_TIMEOUT=10
readonly HEALTH_CHECK_URL="http://localhost:${PORT}/api/health"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Start time for duration tracking
START_TIME=$(date +%s)

# Source Discord notifications (optional)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/scripts/discord-notify.sh" ]]; then
    source "$SCRIPT_DIR/scripts/discord-notify.sh"
fi

# Logging function
log() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message" | tee -a "$LOG_DIR/deploy_$(date +%Y%m%d).log" 2>/dev/null || echo "[$timestamp] $message"
}

# Error handler
error_exit() {
    local message="$1"
    log "${RED}ERROR: $message${NC}"
    notify_deployment_failure "$ENVIRONMENT" "$message" 2>/dev/null || true
    cleanup
    exit 1
}

# Cleanup function
cleanup() {
    rm -f "$LOCK_FILE"
}

# Trap errors and cleanup
trap 'error_exit "Deployment failed at line $LINENO"' ERR
trap cleanup EXIT

# Create backup
create_backup() {
    local backup_path="$BACKUP_DIR/$(date +%Y%m%d_%H%M%S)"
    log "Creating backup at $backup_path..."
    
    mkdir -p "$backup_path"
    
    # Backup current build if exists
    if [[ -d "build" ]]; then
        cp -r build "$backup_path/" || log "Warning: Could not backup build directory"
    fi
    
    # Backup package-lock.json
    if [[ -f "package-lock.json" ]]; then
        cp package-lock.json "$backup_path/" || log "Warning: Could not backup package-lock.json"
    fi
    
    # Save Git commit info
    git rev-parse HEAD > "$backup_path/git-commit.txt" 2>/dev/null || echo "unknown" > "$backup_path/git-commit.txt"
    
    # Rotate old backups (keep last 5)
    local backup_count=$(find "$BACKUP_DIR" -maxdepth 1 -type d | wc -l)
    if [[ $backup_count -gt $MAX_BACKUPS ]]; then
        find "$BACKUP_DIR" -maxdepth 1 -type d -printf '%T+ %p\n' | sort | head -n -$MAX_BACKUPS | cut -d' ' -f2- | xargs rm -rf
        log "Rotated old backups (kept last $MAX_BACKUPS)"
    fi
    
    echo "$backup_path"
}

# Rollback function
rollback_deployment() {
    local reason="$1"
    log "${YELLOW}Initiating rollback: $reason${NC}"
    
    # Find latest backup
    local latest_backup=$(find "$BACKUP_DIR" -maxdepth 1 -type d -printf '%T+ %p\n' | sort -r | head -n 1 | cut -d' ' -f2-)
    
    if [[ -z "$latest_backup" ]] || [[ ! -d "$latest_backup" ]]; then
        log "${RED}No backup found for rollback!${NC}"
        notify_rollback "$ENVIRONMENT" "No backup available" 2>/dev/null || true
        return 1
    fi
    
    log "Rolling back to: $latest_backup"
    
    # Restore build
    if [[ -d "$latest_backup/build" ]]; then
        rm -rf build
        cp -r "$latest_backup/build" .
        log "Build directory restored"
    fi
    
    # Restore package-lock.json and reinstall
    if [[ -f "$latest_backup/package-lock.json" ]]; then
        cp "$latest_backup/package-lock.json" .
        npm ci --legacy-peer-deps > /dev/null 2>&1 || log "Warning: npm ci failed during rollback"
        log "Dependencies restored"
    fi
    
    # Get commit hash and reset
    if [[ -f "$latest_backup/git-commit.txt" ]]; then
        local commit_hash=$(cat "$latest_backup/git-commit.txt")
        if [[ "$commit_hash" != "unknown" ]]; then
            git reset --hard "$commit_hash" > /dev/null 2>&1 || log "Warning: Could not reset to commit $commit_hash"
            log "Git repository reset to $commit_hash"
        fi
    fi
    
    notify_rollback "$ENVIRONMENT" "$reason" 2>/dev/null || true
    log "${GREEN}Rollback completed${NC}"
}

# Graceful shutdown
graceful_shutdown() {
    log "Performing graceful shutdown..."
    
    # Try SIGTERM first
    if lsof -ti:$PORT > /dev/null 2>&1; then
        local pid=$(lsof -ti:$PORT)
        log "Sending SIGTERM to process $pid..."
        kill -SIGTERM $pid 2>/dev/null || true
        
        # Wait up to 10 seconds for graceful shutdown
        local count=0
        while [[ $count -lt 10 ]] && lsof -ti:$PORT > /dev/null 2>&1; do
            sleep 1
            count=$((count + 1))
        done
        
        # Force kill if still running
        if lsof -ti:$PORT > /dev/null 2>&1; then
            log "Process still running, sending SIGKILL..."
            kill -SIGKILL $(lsof -ti:$PORT) 2>/dev/null || true
            sleep 1
        fi
        
        log "Service stopped"
    else
        log "No process running on port $PORT"
    fi
}

# Health check
health_check() {
    log "Running health check..."
    
    local timeout=$HEALTH_CHECK_TIMEOUT
    local count=0
    
    while [[ $count -lt $timeout ]]; do
        if curl -sf "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
            log "${GREEN}Health check passed${NC}"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    
    log "${RED}Health check failed after ${timeout}s${NC}"
    notify_health_check_failed "$ENVIRONMENT" 2>/dev/null || true
    return 1
}

# Validate build artifacts
validate_build() {
    log "Validating build artifacts..."
    
    if [[ ! -f "build/index.js" ]]; then
        error_exit "Build artifact missing: build/index.js"
    fi
    
    if [[ ! -f "build/handler.js" ]]; then
        error_exit "Build artifact missing: build/handler.js"
    fi
    
    local build_size=$(du -sb build 2>/dev/null | cut -f1)
    if [[ $build_size -lt 100000 ]]; then
        log "${YELLOW}Warning: Build size suspiciously small (${build_size} bytes)${NC}"
    fi
    
    log "Build artifacts validated"
}

# Main deployment process
main() {
    clear
    echo "╔════════════════════════════════════════════╗"
    echo "║   Deployment: ${ENVIRONMENT}            ║"
    echo "╚════════════════════════════════════════════╝"
    echo ""
    
    # Check for deployment lock
    if [[ -f "$LOCK_FILE" ]]; then
        error_exit "Deployment already in progress! (Lock file exists: $LOCK_FILE)"
    fi
    
    touch "$LOCK_FILE"
    
    # Create log directory
    mkdir -p "$LOG_DIR" 2>/dev/null || true
    
    # Send start notification
    notify_deployment_start "$ENVIRONMENT" "${USER:-root}" 2>/dev/null || true
    
    # 1. Change to working directory
    echo "[1/9] Verzeichnis wechseln..."
    cd "$WORK_DIR" || error_exit "Could not change to $WORK_DIR"
    log "Working directory: $WORK_DIR"
    
    # 2. Create backup
    echo "[2/9] Backup erstellen..."
    BACKUP_PATH=$(create_backup)
    log "Backup created: $BACKUP_PATH"
    
    # 3. Git update
    echo "[3/9] Git: Hole neueste Änderungen..."
    git reset --hard HEAD || error_exit "Git reset failed"
    git pull || error_exit "Git pull failed"
    log "Git updated successfully"
    
    # 4. Dependencies
    echo "[4/9] NPM: Installiere Dependencies..."
    npm ci --legacy-peer-deps || error_exit "npm ci failed"
    log "Dependencies installed"
    
    # 5. Build
    echo "[5/9] Build: Generiere Produktions-Build..."
    notify_build_start 2>/dev/null || true
    
    BUILD_START=$(date +%s)
    if npm run build; then
        BUILD_END=$(date +%s)
        BUILD_DURATION=$((BUILD_END - BUILD_START))
        log "Build successful (${BUILD_DURATION}s)"
        notify_build_success "${BUILD_DURATION}s" 2>/dev/null || true
    else
        notify_build_failure "npm run build returned non-zero exit code" 2>/dev/null || true
        rollback_deployment "Build failed"
        error_exit "Build failed"
    fi
    
    # 6. Validate build
    echo "[6/9] Build validieren..."
    validate_build
    
    # 7. Set permissions
    echo "[7/9] System: Setze Dateirechte (www:www)..."
    chown -R www:www "$WORK_DIR" || log "Warning: Could not change ownership"
    chmod -R 755 "$WORK_DIR" || log "Warning: Could not change permissions"
    
    # 8. Restart service
    echo "[8/9] Service: Neustart durchführen..."
    graceful_shutdown
    
    # Start service
    sudo -u www bash /www/server/nodejs/vhost/scripts/devcachyapp.sh > /dev/null 2>&1 &
    sleep 2
    log "Service started"
    
    # 9. Health check
    echo "[9/9] Health Check durchführen..."
    if ! health_check; then
        rollback_deployment "Health check failed"
        
        # Restart after rollback
        graceful_shutdown
        sudo -u www bash /www/server/nodejs/vhost/scripts/devcachyapp.sh > /dev/null 2>&1 &
        sleep 2
        
        error_exit "Deployment failed: Health check unsuccessful"
    fi
    
    # Calculate total duration
    END_TIME=$(date +%s)
    TOTAL_DURATION=$((END_TIME - START_TIME))
    DURATION_MIN=$((TOTAL_DURATION / 60))
    DURATION_SEC=$((TOTAL_DURATION % 60))
    
    echo ""
    echo "${GREEN}╔════════════════════════════════════════════╗${NC}"
    echo "${GREEN}║         ✅ Deployment erfolgreich         ║${NC}"
    echo "${GREEN}╚════════════════════════════════════════════╝${NC}"
    echo "Dauer: ${DURATION_MIN}m ${DURATION_SEC}s"
    echo ""
    
    log "Deployment completed successfully in ${DURATION_MIN}m ${DURATION_SEC}s"
    notify_deployment_success "$ENVIRONMENT" "${DURATION_MIN}m ${DURATION_SEC}s" 2>/dev/null || true
}

# Run main function
main
