#!/bin/bash

# Production startup script for Simulation API
set -euo pipefail

# Default values
NODE_ENV="${NODE_ENV:-production}"
PORT="${PORT:-3000}"
LOG_LEVEL="${LOG_LEVEL:-info}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Simulation API in Production Mode${NC}"
echo "=================================="

# Function to log messages
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARN:${NC} $1"
}

# Pre-flight checks
log "Running pre-flight checks..."

# Check Node.js version
NODE_VERSION=$(node --version)
log "Node.js version: $NODE_VERSION"

if ! node --version | grep -q "v1[8-9]\|v2[0-9]"; then
    error "Node.js version 18+ is required"
    exit 1
fi

# Check if environment file exists
if [ -f ".${NODE_ENV}.env" ]; then
    log "Found environment file: .${NODE_ENV}.env"
else
    warn "Environment file .${NODE_ENV}.env not found, using system environment"
fi

# Check required environment variables
log "Checking required environment variables..."

required_vars=(
    "FIREBASE_PROJECT_ID"
    # "REDIS_URL" Uncomment if Redis is mandatory
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    error "Missing required environment variables: ${missing_vars[*]}"
    error "Please set these variables before starting the application"
    exit 1
fi

# Check if Firebase credentials file exists

# Check Redis connectivity
log "Testing Redis connectivity..."
if command -v redis-cli >/dev/null 2>&1; then
    if ! timeout 5 redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1; then
        warn "Cannot connect to Redis at $REDIS_URL"
        warn "Application may not function correctly without Redis"
    else
        log "Redis connection successful"
    fi
else
    warn "redis-cli not available, skipping Redis connectivity test"
fi

# Check if application is already built
if [ ! -d "dist" ]; then
    error "Application not built. Run 'npm run build' first."
    exit 1
fi
log "Application build found"

# Check disk space (warn if less than 1GB)
if command -v df >/dev/null 2>&1; then
    DISK_SPACE=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$DISK_SPACE" -lt 1 ]; then
        warn "Low disk space: ${DISK_SPACE}GB available"
    fi
    log "Disk space: ${DISK_SPACE}GB available"
fi

# Set process limits
log "Setting process limits..."
ulimit -n 65536  # File descriptors
ulimit -u 32768  # Max user processes

# Set NODE_OPTIONS for production
export NODE_OPTIONS="--max-old-space-size=2048 --optimize-for-size"

# Set timezone
export TZ="${TZ:-UTC}"

# Create necessary directories
mkdir -p logs tmp

log "Starting application..."
log "Environment: $NODE_ENV"
log "Port: $PORT"
log "Log Level: $LOG_LEVEL"
log "Process ID: $$"

# Set up graceful shutdown handlers
cleanup() {
    log "Received shutdown signal, gracefully shutting down..."
    # Kill child processes
    jobs -p | xargs -r kill
    exit 0
}

trap cleanup SIGTERM SIGINT

# Start the application with process monitoring
if command -v pm2 >/dev/null 2>&1; then
    log "Starting with PM2..."
    exec pm2-runtime start ecosystem.config.js --env production
else
    log "Starting with Node.js..."
    # In production, you should use a process manager like PM2, systemd, or Docker
    exec node dist/src/main.js
fi