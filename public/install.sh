#!/usr/bin/env bash
# ==============================================================================
# VPS Monitor Agent - one-line installer
#
# Usage (on the target VPS):
#   curl -fsSL <DASHBOARD_URL>/api/install | sudo bash
#
# This installer:
#   - Installs deps (curl, jq) if missing
#   - Drops the agent script into /opt/vps-monitor-agent/
#   - Registers with the dashboard (auto-generates agentId + token)
#   - Installs and starts a systemd service that survives reboots
# ==============================================================================
set -euo pipefail

SERVER_URL="__SERVER_URL__"
INTERVAL="__INTERVAL__"
INSTALL_DIR="/opt/vps-monitor-agent"
CONFIG_FILE="$INSTALL_DIR/agent.conf"
AGENT_SCRIPT="$INSTALL_DIR/agent.sh"
UNINSTALL_SCRIPT="$INSTALL_DIR/uninstall.sh"
SERVICE_FILE="/etc/systemd/system/vps-monitor-agent.service"

c_blue=$'\e[1;34m'; c_green=$'\e[1;32m'; c_yellow=$'\e[1;33m'; c_red=$'\e[1;31m'; c_reset=$'\e[0m'
log()  { printf '%s==>%s %s\n' "$c_blue"   "$c_reset" "$*"; }
ok()   { printf '%s✓%s   %s\n' "$c_green"  "$c_reset" "$*"; }
warn() { printf '%s!%s   %s\n' "$c_yellow" "$c_reset" "$*"; }
die()  { printf '%s✗%s   %s\n' "$c_red"    "$c_reset" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Please run as root (or with sudo)."

# ---- Detect package manager and install deps -------------------------------
log "Installing dependencies (curl, jq)…"
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y >/dev/null
  apt-get install -y curl jq ca-certificates >/dev/null
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y curl jq ca-certificates >/dev/null
elif command -v yum >/dev/null 2>&1; then
  yum install -y curl jq ca-certificates >/dev/null
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache curl jq ca-certificates bash procps coreutils >/dev/null
elif command -v pacman >/dev/null 2>&1; then
  pacman -Sy --noconfirm curl jq ca-certificates >/dev/null
else
  warn "No supported package manager found. Assuming curl/jq already installed."
fi
ok "Dependencies ready."

# ---- Collect system info ----------------------------------------------------
log "Detecting system…"

HOSTNAME_VAL="$(hostname 2>/dev/null || echo unknown)"
ARCH="$(uname -m 2>/dev/null || echo unknown)"
KERNEL="$(uname -r 2>/dev/null || echo unknown)"

OS_ID="linux"; OS_VER=""
if [ -r /etc/os-release ]; then
  . /etc/os-release
  OS_ID="${ID:-linux}"
  OS_VER="${VERSION_ID:-}"
fi

CPU_MODEL="$(awk -F: '/model name/{gsub(/^ +/,"",$2); print $2; exit}' /proc/cpuinfo 2>/dev/null || true)"
[ -z "$CPU_MODEL" ] && CPU_MODEL="$(uname -p 2>/dev/null || echo unknown)"
CPU_CORES="$(nproc 2>/dev/null || echo 1)"

MEM_TOTAL_KB="$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0)"
MEM_TOTAL_BYTES=$(( MEM_TOTAL_KB * 1024 ))

DISK_TOTAL_BYTES="$(df -B1 --output=size / 2>/dev/null | tail -1 | tr -d ' ' || echo 0)"
[ -z "$DISK_TOTAL_BYTES" ] && DISK_TOTAL_BYTES=0

PRIVATE_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
PUBLIC_IP="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || true)"
[ -z "$PUBLIC_IP" ] && PUBLIC_IP="$(curl -fsS --max-time 4 https://ifconfig.me 2>/dev/null || true)"

# ---- Generate or reuse agent id --------------------------------------------
mkdir -p "$INSTALL_DIR"

if [ -f "$CONFIG_FILE" ]; then
  log "Existing config detected — re-registering with same agentId."
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
fi

if [ -z "${AGENT_ID:-}" ]; then
  AGENT_ID="vps_$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi

# ---- Register with dashboard ------------------------------------------------
log "Registering with $SERVER_URL …"

REG_PAYLOAD=$(jq -n \
  --arg agentId "$AGENT_ID" \
  --arg hostname "$HOSTNAME_VAL" \
  --arg os "$OS_ID" \
  --arg osVersion "$OS_VER" \
  --arg kernel "$KERNEL" \
  --arg arch "$ARCH" \
  --arg cpuModel "$CPU_MODEL" \
  --argjson cpuCores "${CPU_CORES:-1}" \
  --argjson totalMemoryBytes "${MEM_TOTAL_BYTES:-0}" \
  --argjson totalDiskBytes "${DISK_TOTAL_BYTES:-0}" \
  --arg publicIp "${PUBLIC_IP:-}" \
  --arg privateIp "${PRIVATE_IP:-}" \
  '{agentId:$agentId, hostname:$hostname, os:$os, osVersion:$osVersion, kernel:$kernel, arch:$arch, cpuModel:$cpuModel, cpuCores:$cpuCores, totalMemoryBytes:$totalMemoryBytes, totalDiskBytes:$totalDiskBytes, publicIp:$publicIp, privateIp:$privateIp}')

REG_RESPONSE="$(curl -fsS -X POST "$SERVER_URL/api/agents/register" \
  -H 'Content-Type: application/json' \
  -d "$REG_PAYLOAD" || true)"

if [ -z "$REG_RESPONSE" ]; then
  die "Failed to contact dashboard at $SERVER_URL. Check connectivity / firewall."
fi

NEW_AGENT_ID=$(echo "$REG_RESPONSE" | jq -r '.agentId // empty')
NEW_TOKEN=$(echo "$REG_RESPONSE" | jq -r '.token // empty')

if [ -z "$NEW_AGENT_ID" ] || [ -z "$NEW_TOKEN" ]; then
  die "Registration failed. Server response: $REG_RESPONSE"
fi

AGENT_ID="$NEW_AGENT_ID"
AGENT_TOKEN="$NEW_TOKEN"
ok "Registered as $AGENT_ID."

# ---- Write config -----------------------------------------------------------
umask 077
cat > "$CONFIG_FILE" <<EOF
SERVER_URL="$SERVER_URL"
AGENT_ID="$AGENT_ID"
AGENT_TOKEN="$AGENT_TOKEN"
INTERVAL="$INTERVAL"
EOF
chmod 600 "$CONFIG_FILE"

# ---- Write agent script -----------------------------------------------------
cat > "$AGENT_SCRIPT" <<'AGENT_EOF'
#!/usr/bin/env bash
# vps-monitor-agent: collects metrics and POSTs to the dashboard.
set -u

CONFIG_FILE="/opt/vps-monitor-agent/agent.conf"
# shellcheck disable=SC1090
. "$CONFIG_FILE"

DOCKER_SOCK="/var/run/docker.sock"

PREV_RX=0; PREV_TX=0; PREV_TS=0
PREV_CPU_TOTAL=0; PREV_CPU_IDLE=0

read_cpu() {
  read -r _ user nice system idle iowait irq softirq steal _ < /proc/stat
  local idle_all=$((idle + iowait))
  local non_idle=$((user + nice + system + irq + softirq + steal))
  local total=$((idle_all + non_idle))
  echo "$total $idle_all"
}

read_net() {
  local rx=0 tx=0
  while IFS= read -r line; do
    case "$line" in
      *:*)
        local iface="${line%%:*}"
        iface="${iface// /}"
        case "$iface" in
          lo|docker*|veth*|br-*|virbr*|tun*|tap*|wg*|cni*|flannel*|cali*) continue ;;
        esac
        local rest="${line#*:}"
        # shellcheck disable=SC2086
        set -- $rest
        rx=$(( rx + ${1:-0} ))
        tx=$(( tx + ${9:-0} ))
        ;;
    esac
  done < /proc/net/dev
  echo "$rx $tx"
}

get_disk() {
  df -B1 --output=used,size / 2>/dev/null | tail -1
}

docker_available() {
  [ -S "$DOCKER_SOCK" ] || return 1
  curl -fsS --unix-socket "$DOCKER_SOCK" --max-time 3 "http://localhost/_ping" >/dev/null 2>&1
}

docker_api_get() {
  curl -fsS --unix-socket "$DOCKER_SOCK" --max-time 5 "http://localhost$1" 2>/dev/null
}

docker_api_post() {
  curl -fsS --unix-socket "$DOCKER_SOCK" --max-time 30 -X POST "http://localhost$1" 2>/dev/null
}

collect_docker_containers() {
  # Output a JSON array of container snapshots, each with optional live stats.
  if ! docker_available; then
    echo "[]"
    return
  fi
  local list
  list=$(docker_api_get "/containers/json?all=true" || echo "[]")
  [ -z "$list" ] && list="[]"

  # Map list entries; for each running container fetch stats once (no-stream).
  echo "$list" | jq -c '.[] | {
    id: .Id,
    name: ((.Names // []) | .[0] // "" | sub("^/"; "")),
    image: (.Image // ""),
    imageId: (.ImageID // ""),
    state: (.State // ""),
    status: (.State // ""),
    statusText: (.Status // ""),
    createdAt: (if .Created then (.Created | strftime("%Y-%m-%dT%H:%M:%SZ")) else null end),
    ports: ((.Ports // []) | map({
      host: (.PublicPort // null),
      container: (.PrivatePort // null),
      protocol: (.Type // null),
      ip: (.IP // null)
    }))
  }' 2>/dev/null | while IFS= read -r item; do
    local cid state stats
    cid=$(echo "$item" | jq -r '.id')
    state=$(echo "$item" | jq -r '.state')
    if [ "$state" = "running" ] && [ -n "$cid" ]; then
      stats=$(docker_api_get "/containers/$cid/stats?stream=false" || echo "")
    else
      stats=""
    fi
    if [ -n "$stats" ]; then
      echo "$item" | jq -c --argjson s "$stats" '
        . + (
          ($s.cpu_stats.cpu_usage.total_usage // 0) as $cu |
          ($s.precpu_stats.cpu_usage.total_usage // 0) as $pcu |
          ($s.cpu_stats.system_cpu_usage // 0) as $sys |
          ($s.precpu_stats.system_cpu_usage // 0) as $psys |
          ($s.cpu_stats.online_cpus //
            (($s.cpu_stats.cpu_usage.percpu_usage // []) | length) //
            1) as $cpus |
          (($cu - $pcu) | tonumber) as $cd |
          (($sys - $psys) | tonumber) as $sd |
          (if $sd > 0 and $cd > 0 then ($cd / $sd) * ($cpus | tonumber) * 100 else 0 end) as $cpuPct |
          ((($s.memory_stats.usage // 0) - (($s.memory_stats.stats.cache // 0) // 0))) as $memUsed |
          ($s.memory_stats.limit // 0) as $memLimit |
          (($s.networks // {}) | to_entries | map(.value.rx_bytes // 0) | add // 0) as $rx |
          (($s.networks // {}) | to_entries | map(.value.tx_bytes // 0) | add // 0) as $tx |
          (($s.blkio_stats.io_service_bytes_recursive // [])
            | map(select(.op == "Read" or .op == "read") | .value // 0) | add // 0) as $blkR |
          (($s.blkio_stats.io_service_bytes_recursive // [])
            | map(select(.op == "Write" or .op == "write") | .value // 0) | add // 0) as $blkW |
          {
            cpuPercent: ($cpuPct | (. * 100 | round) / 100),
            memUsedBytes: ($memUsed | floor),
            memLimitBytes: $memLimit,
            netRxBytes: $rx,
            netTxBytes: $tx,
            blockReadBytes: $blkR,
            blockWriteBytes: $blkW,
            startedAt: ($s.read // null)
          }
        )'
    else
      echo "$item" | jq -c '. + {
        cpuPercent: 0,
        memUsedBytes: 0,
        memLimitBytes: 0,
        netRxBytes: 0,
        netTxBytes: 0,
        blockReadBytes: 0,
        blockWriteBytes: 0
      }'
    fi
  done | jq -sc '.' 2>/dev/null || echo "[]"
}

execute_command() {
  # $1 = command JSON: {id, action, containerId, args}
  local cmd="$1"
  local id action cid tail body out err status exit_code shell_cmd cwd timeout_seconds tmp_out
  id=$(echo "$cmd" | jq -r '.id // empty')
  action=$(echo "$cmd" | jq -r '.action // empty')
  cid=$(echo "$cmd" | jq -r '.containerId // empty')
  [ -z "$id" ] || [ -z "$action" ] && return

  status="success"
  out=""
  err=""
  exit_code=0

  case "$action" in
    shell)
      shell_cmd=$(echo "$cmd" | jq -r '.args.command // empty')
      cwd=$(echo "$cmd" | jq -r '.args.cwd // empty')
      timeout_seconds=$(echo "$cmd" | jq -r '.args.timeoutSeconds // 30')
      case "$timeout_seconds" in
        ''|*[!0-9]*) timeout_seconds=30 ;;
      esac
      [ "$timeout_seconds" -lt 1 ] && timeout_seconds=1
      [ "$timeout_seconds" -gt 120 ] && timeout_seconds=120

      if [ -z "$shell_cmd" ]; then
        status="failed"
        err="empty command"
        exit_code=2
      else
        tmp_out="$(mktemp)"
        if [ -n "$cwd" ] && [ -d "$cwd" ]; then
          (cd "$cwd" && timeout "$timeout_seconds" bash -lc "$shell_cmd") >"$tmp_out" 2>&1
        else
          timeout "$timeout_seconds" bash -lc "$shell_cmd" >"$tmp_out" 2>&1
        fi
        exit_code=$?
        out=$(head -c 65536 "$tmp_out")
        rm -f "$tmp_out"
        if [ "$exit_code" -ne 0 ]; then
          status="failed"
          err="command exited with code $exit_code"
        fi
      fi
      ;;
    start|stop|restart|logs)
      if ! docker_available; then
        status="failed"
        err="docker socket unavailable"
      else
        case "$action" in
      start)
        if ! err=$(docker_api_post "/containers/$cid/start" 2>&1); then
          status="failed"
        fi
        ;;
      stop)
        if ! err=$(docker_api_post "/containers/$cid/stop" 2>&1); then
          status="failed"
        fi
        ;;
      restart)
        if ! err=$(docker_api_post "/containers/$cid/restart" 2>&1); then
          status="failed"
        fi
        ;;
      logs)
        tail=$(echo "$cmd" | jq -r '.args.tail // 200')
        # Docker logs over the API stream the body raw (with framing for tty=false).
        # `docker logs` CLI normalizes that for us — much simpler.
        if command -v docker >/dev/null 2>&1; then
          out=$(docker logs --tail "$tail" "$cid" 2>&1 | head -c 65536) || true
        else
          status="failed"
          err="docker CLI not installed"
        fi
        ;;
        esac
      fi
      ;;
    *)
      status="failed"
      err="unknown action: $action"
      exit_code=2
      ;;
  esac

  body=$(jq -n \
    --arg agentId "$AGENT_ID" \
    --arg token "$AGENT_TOKEN" \
    --arg commandId "$id" \
    --arg status "$status" \
    --arg stdout "$out" \
    --arg error "$err" \
    --argjson exitCode "$exit_code" \
    '{agentId:$agentId, token:$token, commandId:$commandId, status:$status, result:{stdout:$stdout, error:$error, exitCode:$exitCode}}')

  curl -fsS --max-time 10 -X POST "$SERVER_URL/api/agents/commands/ack" \
    -H 'Content-Type: application/json' \
    -d "$body" >/dev/null 2>&1 || true
}

# Prime CPU + net counters once
read PREV_CPU_TOTAL PREV_CPU_IDLE <<<"$(read_cpu)"
read PREV_RX PREV_TX <<<"$(read_net)"
PREV_TS=$(date +%s)
sleep 1

while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - PREV_TS))
  [ "$ELAPSED" -le 0 ] && ELAPSED=1

  # CPU
  read CPU_TOTAL CPU_IDLE <<<"$(read_cpu)"
  DT=$((CPU_TOTAL - PREV_CPU_TOTAL))
  DI=$((CPU_IDLE - PREV_CPU_IDLE))
  if [ "$DT" -gt 0 ]; then
    CPU_PERCENT=$(awk -v d="$DT" -v i="$DI" 'BEGIN { printf "%.2f", (1 - i/d) * 100 }')
  else
    CPU_PERCENT="0"
  fi
  PREV_CPU_TOTAL=$CPU_TOTAL
  PREV_CPU_IDLE=$CPU_IDLE

  # Load
  read L1 L5 L15 _ < /proc/loadavg

  # Memory
  MEM_TOTAL_KB=$(awk '/MemTotal/{print $2}' /proc/meminfo)
  MEM_AVAIL_KB=$(awk '/MemAvailable/{print $2}' /proc/meminfo)
  SWAP_TOTAL_KB=$(awk '/SwapTotal/{print $2}' /proc/meminfo)
  SWAP_FREE_KB=$(awk '/SwapFree/{print $2}' /proc/meminfo)
  MEM_TOTAL=$(( MEM_TOTAL_KB * 1024 ))
  MEM_USED=$(( (MEM_TOTAL_KB - MEM_AVAIL_KB) * 1024 ))
  SWAP_TOTAL=$(( SWAP_TOTAL_KB * 1024 ))
  SWAP_USED=$(( (SWAP_TOTAL_KB - SWAP_FREE_KB) * 1024 ))

  # Disk on /
  read DISK_USED DISK_TOTAL <<<"$(get_disk)"

  # Network
  read RX TX <<<"$(read_net)"
  RX_DELTA=$(( RX - PREV_RX ))
  TX_DELTA=$(( TX - PREV_TX ))
  [ "$RX_DELTA" -lt 0 ] && RX_DELTA=0
  [ "$TX_DELTA" -lt 0 ] && TX_DELTA=0
  RX_BPS=$(( RX_DELTA / ELAPSED ))
  TX_BPS=$(( TX_DELTA / ELAPSED ))
  PREV_RX=$RX; PREV_TX=$TX; PREV_TS=$NOW

  # Uptime
  UPTIME=$(awk '{print int($1)}' /proc/uptime)

  # Process count
  PROC_COUNT=$(ls -1 /proc 2>/dev/null | grep -c '^[0-9][0-9]*$')

  # Docker containers (empty array when no docker socket)
  CONTAINERS_JSON=$(collect_docker_containers)
  [ -z "$CONTAINERS_JSON" ] && CONTAINERS_JSON="[]"

  PAYLOAD=$(jq -n \
    --arg agentId "$AGENT_ID" \
    --arg token   "$AGENT_TOKEN" \
    --argjson cpuPercent "$CPU_PERCENT" \
    --argjson loadAvg1   "$L1" \
    --argjson loadAvg5   "$L5" \
    --argjson loadAvg15  "$L15" \
    --argjson memUsedBytes   "$MEM_USED" \
    --argjson memTotalBytes  "$MEM_TOTAL" \
    --argjson swapUsedBytes  "$SWAP_USED" \
    --argjson swapTotalBytes "$SWAP_TOTAL" \
    --argjson diskUsedBytes  "$DISK_USED" \
    --argjson diskTotalBytes "$DISK_TOTAL" \
    --argjson netRxBytes "$RX" \
    --argjson netTxBytes "$TX" \
    --argjson netRxBps   "$RX_BPS" \
    --argjson netTxBps   "$TX_BPS" \
    --argjson uptimeSeconds "$UPTIME" \
    --argjson processCount  "$PROC_COUNT" \
    --argjson containers "$CONTAINERS_JSON" \
    '{agentId:$agentId, token:$token, cpuPercent:$cpuPercent, loadAvg1:$loadAvg1, loadAvg5:$loadAvg5, loadAvg15:$loadAvg15, memUsedBytes:$memUsedBytes, memTotalBytes:$memTotalBytes, swapUsedBytes:$swapUsedBytes, swapTotalBytes:$swapTotalBytes, diskUsedBytes:$diskUsedBytes, diskTotalBytes:$diskTotalBytes, netRxBytes:$netRxBytes, netTxBytes:$netTxBytes, netRxBps:$netRxBps, netTxBps:$netTxBps, uptimeSeconds:$uptimeSeconds, processCount:$processCount, containers:$containers}')

  RESPONSE=$(curl -fsS --max-time 15 -X POST "$SERVER_URL/api/agents/heartbeat" \
    -H 'Content-Type: application/json' \
    -d "$PAYLOAD" 2>/dev/null || echo "")

  if [ -n "$RESPONSE" ]; then
    PENDING_COUNT=$(echo "$RESPONSE" | jq '.pendingCommands | length // 0' 2>/dev/null || echo 0)
    if [ "${PENDING_COUNT:-0}" -gt 0 ]; then
      while IFS= read -r cmd; do
        [ -n "$cmd" ] && execute_command "$cmd"
      done < <(echo "$RESPONSE" | jq -c '.pendingCommands[]' 2>/dev/null)
    fi
  fi

  sleep "$INTERVAL"
done
AGENT_EOF

chmod +x "$AGENT_SCRIPT"

# ---- Write uninstall script -------------------------------------------------
cat > "$UNINSTALL_SCRIPT" <<'UNI_EOF'
#!/usr/bin/env bash
set -e
[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }
systemctl stop vps-monitor-agent 2>/dev/null || true
systemctl disable vps-monitor-agent 2>/dev/null || true
rm -f /etc/systemd/system/vps-monitor-agent.service
systemctl daemon-reload || true
rm -rf /opt/vps-monitor-agent
echo "vps-monitor-agent removed."
UNI_EOF
chmod +x "$UNINSTALL_SCRIPT"

# ---- systemd service --------------------------------------------------------
log "Installing systemd service…"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=VPS Monitor Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env bash $AGENT_SCRIPT
Restart=always
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal
KillMode=control-group

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable vps-monitor-agent >/dev/null 2>&1
systemctl restart vps-monitor-agent

sleep 2
if systemctl is-active --quiet vps-monitor-agent; then
  ok "Agent is running."
else
  warn "Agent service is not active. Run: journalctl -u vps-monitor-agent -n 50"
fi

echo
echo "${c_green}✔ Installation complete!${c_reset}"
echo "  Agent ID:      $AGENT_ID"
echo "  Dashboard:     $SERVER_URL"
echo "  Status:        sudo systemctl status vps-monitor-agent"
echo "  Logs:          sudo journalctl -u vps-monitor-agent -f"
echo "  Uninstall:     sudo $UNINSTALL_SCRIPT"
echo
