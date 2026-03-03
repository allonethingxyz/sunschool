#!/usr/bin/env bash
# claude-container.sh — Orchestrator for Claude Code sandbox container (SUNSCHOOL)
# The app runs on Replit. This container is for Claude Code to develop against it.
# Usage: ./claude-container.sh <command>
set -euo pipefail

CONTAINER_NAME="sunschool-claude"
IMAGE_NAME="sunschool-claude-sandbox"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$PROJECT_DIR/.env.claude"
CLAUDE_DIR="$HOME/.claude"
SSH_DIR="$HOME/.ssh"

# Replit SSH connection — set REPLIT_SSH_HOST and REPLIT_SSH_USER in .env.claude
# (never hardcode these values in source control)
REPLIT_SSH_HOST="${REPLIT_SSH_HOST:-}"
REPLIT_SSH_USER="${REPLIT_SSH_USER:-}"
REPLIT_SSH_KEY="~/.ssh/replit"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[sunschool]${NC} $*"; }
warn() { echo -e "${YELLOW}[sunschool]${NC} $*"; }
err()  { echo -e "${RED}[sunschool]${NC} $*" >&2; }
info() { echo -e "${CYAN}[sunschool]${NC} $*"; }

# ── Load secrets from .env.claude (mirrors Replit Secrets) ───────────
load_env() {
    if [[ ! -f "$ENV_FILE" ]]; then
        err "Missing $ENV_FILE — create it with your Replit Secrets:"
        err ""
        err "  SESSION_SECRET=..."
        err "  DATABASE_URL=postgresql://..."
        err "  PGDATABASE=neondb"
        err "  PGHOST=..."
        err "  PGPORT=5432"
        err "  PGUSER=..."
        err "  PGPASSWORD=..."
        err "  OPENROUTER_API_KEY=sk-or-..."
        err "  JWT_SECRET=..."
        err "  STABILITY_API_KEY=..."
        err "  USE_AI=1"
        err "  TS_NODE_TRANSPILE_ONLY=true"
        err ""
        err "  # Optional: ANTHROPIC_API_KEY=sk-ant-..."
        exit 1
    fi

    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a

    if [[ -z "${DATABASE_URL:-}" ]]; then
        warn "DATABASE_URL is empty in $ENV_FILE — fill in Replit Secrets for full functionality"
    fi

    if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
        warn "No ANTHROPIC_API_KEY set — Claude Code will use interactive auth inside container"
    fi
}

# ── Build ────────────────────────────────────────────────────────────
cmd_build() {
    log "Building sandbox image..."
    docker build -t "$IMAGE_NAME" -f "$PROJECT_DIR/.devcontainer/Dockerfile" "$PROJECT_DIR/.devcontainer"
    log "Image built: $IMAGE_NAME"
}

# ── Start container ──────────────────────────────────────────────────
cmd_start() {
    load_env

    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        log "Container already running"
        return 0
    fi

    # Remove stopped container if exists
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

    log "Starting container..."

    # Pass Replit Secrets as env vars (matches Replit's Secrets panel exactly)
    local env_flags=(
        -e "SESSION_SECRET=${SESSION_SECRET:-}"
        -e "DATABASE_URL=${DATABASE_URL:-}"
        -e "PGDATABASE=${PGDATABASE:-}"
        -e "PGHOST=${PGHOST:-}"
        -e "PGPORT=${PGPORT:-5432}"
        -e "PGUSER=${PGUSER:-}"
        -e "PGPASSWORD=${PGPASSWORD:-}"
        -e "OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}"
        -e "JWT_SECRET=${JWT_SECRET:-}"
        -e "STABILITY_API_KEY=${STABILITY_API_KEY:-}"
        -e "USE_AI=${USE_AI:-1}"
        -e "TS_NODE_TRANSPILE_ONLY=${TS_NODE_TRANSPILE_ONLY:-true}"
        -e "NODE_ENV=${NODE_ENV:-development}"
        -e "PORT=${PORT:-5000}"
        -e "EXTRA_ALLOWED_DOMAINS=${EXTRA_ALLOWED_DOMAINS:-}"
        -e "REPLIT_SSH_HOST=$REPLIT_SSH_HOST"
    )
    if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
        env_flags+=(-e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY")
    fi

    docker run -d \
        --name "$CONTAINER_NAME" \
        --cap-add NET_ADMIN \
        --cap-add NET_RAW \
        "${env_flags[@]}" \
        -v "$PROJECT_DIR:$PROJECT_DIR:delegated" \
        -v "$CLAUDE_DIR:/home/claude/.claude:cached" \
        -v "$SSH_DIR:/home/claude/.ssh:ro" \
        -v "$PROJECT_DIR/.claude/host-bridge.sh:/home/claude/.claude/host-bridge.sh:ro" \
        -v "$PROJECT_DIR/.claude/host-request.sh:/home/claude/.claude/host-request.sh:ro" \
        -w "$PROJECT_DIR" \
        "$IMAGE_NAME" \
        sleep infinity

    # Install project dependencies
    log "Installing npm dependencies..."
    docker exec "$CONTAINER_NAME" bash -c "npm install --prefer-offline 2>&1 | tail -3"

    # Initialize firewall
    log "Configuring firewall..."
    docker exec "$CONTAINER_NAME" sudo /usr/local/bin/init-firewall.sh

    log "Container ready: $CONTAINER_NAME"
    info "Run './claude-container.sh claude' to start a Claude Code session"
    info "Run './claude-container.sh ssh' to connect to Replit"
}

# ── Up (build + start) ──────────────────────────────────────────────
cmd_up() {
    cmd_build
    cmd_start
}

# ── Claude Code session ─────────────────────────────────────────────
cmd_claude() {
    if ! docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        err "Container not running. Run: ./claude-container.sh start"
        exit 1
    fi

    log "Launching Claude Code (--dangerously-skip-permissions)..."
    local exec_flags=(-it)
    # Source env file lightly — only need ANTHROPIC_API_KEY here;
    # all other secrets were already injected at container start.
    if [[ -f "$ENV_FILE" ]]; then
        set -a; source "$ENV_FILE" 2>/dev/null; set +a
    fi
    if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
        exec_flags+=(-e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY")
    fi
    docker exec "${exec_flags[@]}" \
        "$CONTAINER_NAME" \
        claude --dangerously-skip-permissions "$@"
}

# ── Interactive shell ────────────────────────────────────────────────
cmd_shell() {
    if ! docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        err "Container not running. Run: ./claude-container.sh start"
        exit 1
    fi

    docker exec -it "$CONTAINER_NAME" bash
}

# ── SSH to Replit ────────────────────────────────────────────────────
cmd_ssh() {
    if ! docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        err "Container not running. Run: ./claude-container.sh start"
        exit 1
    fi

    log "Connecting to Replit via SSH..."
    docker exec -it "$CONTAINER_NAME" \
        ssh -i /home/claude/.ssh/replit \
            -o StrictHostKeyChecking=no \
            -p 22 \
            "${REPLIT_SSH_USER}@${REPLIT_SSH_HOST}" "$@"
}

# ── Run a command on Replit via SSH ──────────────────────────────────
cmd_replit() {
    if ! docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        err "Container not running. Run: ./claude-container.sh start"
        exit 1
    fi

    if [[ $# -eq 0 ]]; then
        err "Usage: ./claude-container.sh replit <command>"
        err "Example: ./claude-container.sh replit 'npm run migrate'"
        err "Example: ./claude-container.sh replit 'pm2 restart all'"
        exit 1
    fi

    log "Running on Replit: $*"
    docker exec "$CONTAINER_NAME" \
        ssh -i /home/claude/.ssh/replit \
            -o StrictHostKeyChecking=no \
            -p 22 \
            "${REPLIT_SSH_USER}@${REPLIT_SSH_HOST}" "$@"
}

# ── Run tests ────────────────────────────────────────────────────────
cmd_test() {
    if ! docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        err "Container not running. Run: ./claude-container.sh start"
        exit 1
    fi

    log "Running tests..."

    # TypeScript type check
    log "  -> Type check..."
    docker exec "$CONTAINER_NAME" npx tsc --noEmit 2>&1 | tail -5 || warn "Type errors found"

    # Unit tests (if configured)
    log "  -> Unit tests..."
    docker exec "$CONTAINER_NAME" npx jest --passWithNoTests 2>&1 | tail -5 || warn "Tests failed or skipped"

    log "Tests complete."
}

# ── Status ───────────────────────────────────────────────────────────
cmd_status() {
    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        log "Container: running"
        docker ps -f name="$CONTAINER_NAME" --format "table {{.Status}}\t{{.Ports}}"
    else
        warn "Container: stopped"
    fi
}

# ── Logs ─────────────────────────────────────────────────────────────
cmd_logs() {
    docker logs "$CONTAINER_NAME" "${@:---tail 50}"
}

# ── Stop ─────────────────────────────────────────────────────────────
cmd_stop() {
    log "Stopping container..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    log "Stopped."
}

# ── Bridge daemon ────────────────────────────────────────────────────
cmd_bridge() {
    log "Starting host bridge daemon..."
    info "This runs on the HOST and relays commands from the container."
    info "Press Ctrl+C to stop."
    exec bash "$PROJECT_DIR/.claude/host-bridge.sh" "${1:-1}"
}

# ── Main ─────────────────────────────────────────────────────────────
case "${1:-help}" in
    up)      cmd_up ;;
    build)   cmd_build ;;
    start)   cmd_start ;;
    claude)  shift; cmd_claude "$@" ;;
    shell)   cmd_shell ;;
    ssh)     shift; cmd_ssh "$@" ;;
    replit)  shift; cmd_replit "$@" ;;
    test)    cmd_test ;;
    bridge)  shift; cmd_bridge "$@" ;;
    status)  cmd_status ;;
    logs)    shift; cmd_logs "$@" ;;
    stop)    cmd_stop ;;
    help|*)
        echo "Usage: ./claude-container.sh <command>"
        echo ""
        echo "Lifecycle:"
        echo "  up       Build image and start container"
        echo "  build    Build the sandbox Docker image"
        echo "  start    Start the container (requires .env.claude)"
        echo "  stop     Stop the container"
        echo ""
        echo "Claude Code:"
        echo "  claude   Launch Claude Code session (--dangerously-skip-permissions)"
        echo "  shell    Open an interactive bash shell in the container"
        echo "  bridge   Start host bridge daemon (run on HOST for git push, etc.)"
        echo ""
        echo "Replit:"
        echo "  ssh      SSH into the Replit instance (interactive)"
        echo "  replit   Run a command on Replit via SSH"
        echo "           Example: ./claude-container.sh replit 'npm run migrate'"
        echo ""
        echo "Development:"
        echo "  test     Run type checks and unit tests"
        echo ""
        echo "Info:"
        echo "  status   Show container status"
        echo "  logs     Show container logs (pass docker logs flags)"
        ;;
esac
