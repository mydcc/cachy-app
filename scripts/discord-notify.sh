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


# Discord Webhook Notification System
# Supports optional Discord integration - fails silently if webhook not configured

# Color codes for Discord embeds
readonly COLOR_SUCCESS=3066993   # Green
readonly COLOR_FAILURE=15158332  # Red
readonly COLOR_WARNING=15105570  # Orange
readonly COLOR_INFO=3447003      # Blue

# Get Git information
get_git_info() {
    local commit_hash=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local commit_message=$(git log -1 --pretty=%B 2>/dev/null | head -n 1 | sed 's/"/\\"/g')
    local commit_author=$(git log -1 --pretty=%an 2>/dev/null || echo "unknown")
    local branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    
    echo "$commit_hash|$commit_message|$commit_author|$branch"
}

# Send Discord notification
# Usage: send_discord <title> <message> <color>
send_discord() {
    local title="$1"
    local message="$2"
    local color="${3:-$COLOR_INFO}"
    
    # Silent fail if webhook not configured
    if [[ -z "$DISCORD_WEBHOOK_URL" ]]; then
        return 0
    fi
    
    # Get Git info
    local git_info=$(get_git_info)
    IFS='|' read -r commit_hash commit_message commit_author branch <<< "$git_info"
    
    # Build description with Git info if available
    local description="$message"
    if [[ "$commit_hash" != "unknown" ]]; then
        description="$description\n\n**Commit:** \`$commit_hash\`\n**Message:** $commit_message\n**Author:** $commit_author\n**Branch:** $branch"
    fi
    
    # Get timestamp
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    # Send to Discord
    curl -H "Content-Type: application/json" \
         -X POST \
         -d "{
           \"embeds\": [{
             \"title\": \"$title\",
             \"description\": \"$description\",
             \"color\": $color,
             \"timestamp\": \"$timestamp\"
           }]
         }" \
         "$DISCORD_WEBHOOK_URL" 2>/dev/null
}

# Notification shortcuts
notify_deployment_start() {
    local environment="$1"
    local user="${2:-$USER}"
    send_discord "🚀 Deployment gestartet" "**Environment:** $environment\n**User:** $user" "$COLOR_INFO"
}

notify_build_start() {
    send_discord "📦 Build gestartet" "Erstelle Produktions-Build..." "$COLOR_INFO"
}

notify_build_success() {
    local duration="$1"
    send_discord "✅ Build erfolgreich" "Build abgeschlossen in $duration" "$COLOR_SUCCESS"
}

notify_build_failure() {
    local error_msg="$1"
    send_discord "❌ Build fehlgeschlagen" "**Fehler:**\n\`\`\`\n$error_msg\n\`\`\`" "$COLOR_FAILURE"
}

notify_deployment_success() {
    local environment="$1"
    local duration="$2"
    send_discord "✅ Deployment erfolgreich" "**Environment:** $environment\n**Dauer:** $duration\n\nDeployment abgeschlossen." "$COLOR_SUCCESS"
}

notify_deployment_failure() {
    local environment="$1"
    local reason="$2"
    send_discord "❌ Deployment fehlgeschlagen" "**Environment:** $environment\n**Grund:** $reason\n\nRollback wird durchgeführt..." "$COLOR_FAILURE"
}

notify_rollback() {
    local environment="$1"
    local reason="$2"
    send_discord "🔙 Rollback durchgeführt" "**Environment:** $environment\n**Grund:** $reason\n\nVorherige Version wiederhergestellt." "$COLOR_WARNING"
}

notify_health_check_failed() {
    local environment="$1"
    send_discord "⚠️ Health Check fehlgeschlagen" "**Environment:** $environment\n\nService antwortet nicht. Rollback wird eingeleitet..." "$COLOR_WARNING"
}

# Test function for webhook validation
test_discord_webhook() {
    if [[ -z "$DISCORD_WEBHOOK_URL" ]]; then
        echo "❌ DISCORD_WEBHOOK_URL nicht gesetzt"
        echo ""
        echo "Setzen Sie die Environment Variable:"
        echo "  export DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/...'"
        return 1
    fi
    
    echo "Testing Discord webhook..."
    
    local response=$(curl -s -o /dev/null -w "%{http_code}" \
                         -H "Content-Type: application/json" \
                         -X POST \
                         -d '{"content":"✅ Webhook Test erfolgreich!"}' \
                         "$DISCORD_WEBHOOK_URL")
    
    if [[ "$response" == "204" ]] || [[ "$response" == "200" ]]; then
        echo "✅ Webhook funktioniert (HTTP $response)"
        return 0
    else
        echo "❌ Webhook-Test fehlgeschlagen (HTTP $response)"
        return 1
    fi
}

# Check if Discord is configured
check_discord_configured() {
    [[ -n "$DISCORD_WEBHOOK_URL" ]]
}

# If script is executed directly, run test
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ "$1" == "test" ]]; then
        test_discord_webhook
    else
        echo "Discord Notification System"
        echo ""
        echo "Usage:"
        echo "  source $0                  # Source in anderen Scripts"
        echo "  $0 test                    # Webhook testen"
        echo ""
        if check_discord_configured; then
            echo "Status: ✅ Discord konfiguriert"
        else
            echo "Status: ⚠️  Discord nicht konfiguriert (läuft im Silent-Mode)"
        fi
    fi
fi
