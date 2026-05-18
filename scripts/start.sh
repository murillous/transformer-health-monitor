#!/usr/bin/env bash
#
# Sobe a stack completa de supervisao do Transformer Health Monitor.
#
# - Verifica deps (Node, Python, npm packages, pip packages); instala se faltar.
# - Checa o broker Mosquitto (so avisa se nao estiver rodando).
# - Sobe a ponte Serial->MQTT se COM_PORT (ou SERIAL_PORT) estiver setado.
# - Sobe server (:3001) + dashboard (:5173) via npm run dev.
# - Ctrl+C derruba todos os processos filhos.
#
# Uso:
#   ./scripts/start.sh
#   COM_PORT=/dev/ttyUSB0 ./scripts/start.sh
#   SERIAL_PORT=/tmp/ttyV1 MQTT_BROKER=192.168.1.10 ./scripts/start.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SUPERVISION_DIR="$REPO_ROOT/supervision"
INTELLIGENCE_DIR="$SUPERVISION_DIR/apps/intelligence"
BRIDGE_DIR="$REPO_ROOT/tools/serial_bridge"

COM_PORT="${COM_PORT:-${SERIAL_PORT:-}}"
MQTT_BROKER="${MQTT_BROKER:-localhost}"
MQTT_PORT="${MQTT_PORT:-1883}"
NO_BRIDGE=0
for arg in "$@"; do
    case "$arg" in
        --no-bridge) NO_BRIDGE=1 ;;
        --com-port=*) COM_PORT="${arg#--com-port=}" ;;
    esac
done

# Cores
C_CYAN='\033[1;36m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[1;31m'; C_OFF='\033[0m'
step() { echo -e "${C_CYAN}==> $*${C_OFF}"; }
ok()   { echo -e "    ${C_GREEN}OK${C_OFF} $*"; }
warn() { echo -e "    ${C_YELLOW}!!${C_OFF} $*"; }
err()  { echo -e "    ${C_RED}XX${C_OFF} $*"; }

has() { command -v "$1" >/dev/null 2>&1; }

# ─── Pre-requisitos basicos ───────────────────────────────────────────────
step "Verificando ferramentas base"

if ! has node; then err "Node nao encontrado no PATH"; exit 1; fi
ok "node $(node --version)"

if ! has npm; then err "npm nao encontrado no PATH"; exit 1; fi
ok "npm $(npm --version)"

PYTHON_BIN=""
for c in python3 python py; do
    if has "$c"; then PYTHON_BIN="$c"; break; fi
done
if [[ -z "$PYTHON_BIN" ]]; then err "Python nao encontrado no PATH"; exit 1; fi
ok "python ($PYTHON_BIN) $($PYTHON_BIN --version 2>&1)"

# ─── Dependencias npm (workspaces supervision) ────────────────────────────
step "Verificando dependencias npm em supervision/"
if [[ ! -d "$SUPERVISION_DIR/node_modules" ]]; then
    warn "node_modules ausente — rodando npm install (pode demorar)"
    (cd "$SUPERVISION_DIR" && npm install)
else
    ok "node_modules presente"
fi

# ─── Dependencias Python: intelligence ────────────────────────────────────
step "Verificando dependencias Python do motor fuzzy"
if ! "$PYTHON_BIN" -c "import numpy" 2>/dev/null; then
    warn "numpy ausente — instalando requirements de intelligence"
    "$PYTHON_BIN" -m pip install -r "$INTELLIGENCE_DIR/requirements.txt"
else
    ok "numpy presente"
fi

# ─── Dependencias Python: bridge ──────────────────────────────────────────
step "Verificando dependencias Python da ponte serial"
if ! "$PYTHON_BIN" -c "import paho.mqtt.client, serial" 2>/dev/null; then
    warn "paho-mqtt/pyserial ausentes — instalando requirements da bridge"
    "$PYTHON_BIN" -m pip install -r "$BRIDGE_DIR/requirements.txt"
else
    ok "paho-mqtt + pyserial presentes"
fi

# ─── Mosquitto :1883 ──────────────────────────────────────────────────────
step "Verificando broker Mosquitto em ${MQTT_BROKER}:${MQTT_PORT}"
mqtt_ok=0
if has nc; then
    if nc -z -w 2 "$MQTT_BROKER" "$MQTT_PORT" 2>/dev/null; then mqtt_ok=1; fi
else
    # Fallback puro bash via /dev/tcp
    if (echo > "/dev/tcp/${MQTT_BROKER}/${MQTT_PORT}") 2>/dev/null; then mqtt_ok=1; fi
fi
if [[ $mqtt_ok -eq 1 ]]; then
    ok "Mosquitto respondendo"
else
    warn "Mosquitto nao responde em ${MQTT_BROKER}:${MQTT_PORT} — server vai logar erro de conexao MQTT ate o broker subir"
fi

# ─── Spawn processos filhos ───────────────────────────────────────────────
# Bridge fica em background; npm run dev roda em FOREGROUND pra logs do
# server+web aparecerem direto no console e Ctrl+C ser tratado nativamente.

BRIDGE_PID=""

cleanup() {
    if [[ -n "$BRIDGE_PID" ]] && kill -0 "$BRIDGE_PID" 2>/dev/null; then
        echo ""
        step "Derrubando bridge serial"
        pkill -P "$BRIDGE_PID" 2>/dev/null || true
        kill "$BRIDGE_PID" 2>/dev/null || true
        ok "bridge (PID $BRIDGE_PID) derrubado"
    fi
}
trap cleanup INT TERM EXIT

if [[ $NO_BRIDGE -eq 1 ]]; then
    warn "--no-bridge passado, pulando bridge serial (use simulador via /api/simular/iniciar ou ESP32 direto)"
elif [[ -n "$COM_PORT" ]]; then
    step "Subindo bridge serial em $COM_PORT -> $MQTT_BROKER"
    ( cd "$BRIDGE_DIR" && "$PYTHON_BIN" bridge.py --port "$COM_PORT" --broker "$MQTT_BROKER" ) &
    BRIDGE_PID=$!
    ok "bridge PID $BRIDGE_PID em $COM_PORT"
else
    warn "COM_PORT nao setado, pulando bridge serial (setar via COM_PORT=/dev/ttyUSB0 ou --com-port=...)"
fi

step "Subindo server (:3001) + dashboard (:5173)"
echo ""
echo -e "${C_GREEN}Stack rodando. Abra http://localhost:5173 - Ctrl+C derruba tudo.${C_OFF}"
echo ""

# Foreground: output do concurrently (server + web) sai direto pro console.
# Ctrl+C interrompe o npm e dispara o trap pra matar a bridge.
cd "$SUPERVISION_DIR"
npm run dev
