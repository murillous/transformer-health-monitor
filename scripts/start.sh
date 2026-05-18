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
#   ./scripts/start.sh --com-port /dev/ttyUSB0
#   ./scripts/start.sh --no-bridge

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

# Cores
C_CYAN='\033[1;36m'
C_GREEN='\033[1;32m'
C_YELLOW='\033[1;33m'
C_RED='\033[1;31m'
C_OFF='\033[0m'

step() { printf "%b==> %s%b\n" "$C_CYAN" "$*" "$C_OFF"; }
ok()   { printf "    %bOK%b %s\n" "$C_GREEN" "$C_OFF" "$*"; }
warn() { printf "    %b!!%b %s\n" "$C_YELLOW" "$C_OFF" "$*"; }
err()  { printf "    %bXX%b %s\n" "$C_RED" "$C_OFF" "$*"; }

has() {
    command -v "$1" >/dev/null 2>&1
}

usage() {
    cat <<USAGE
Uso:
  ./scripts/start.sh [opcoes]

Opcoes:
  --no-bridge              Nao sobe a ponte serial
  --com-port PORTA         Porta serial da ponte, ex.: /dev/ttyUSB0
  --com-port=PORTA         Mesmo que acima
  --mqtt-broker HOST       Broker MQTT, padrao: localhost
  --mqtt-broker=HOST       Mesmo que acima
  --mqtt-port PORTA        Porta MQTT usada na verificacao, padrao: 1883
  --mqtt-port=PORTA        Mesmo que acima
  -h, --help               Mostra esta ajuda

Variaveis de ambiente:
  COM_PORT=/dev/ttyUSB0
  SERIAL_PORT=/dev/ttyUSB0
  MQTT_BROKER=localhost
  MQTT_PORT=1883
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-bridge)
            NO_BRIDGE=1
            shift
            ;;
        --com-port=*)
            COM_PORT="${1#--com-port=}"
            shift
            ;;
        --com-port)
            if [[ $# -lt 2 ]]; then
                err "--com-port precisa de uma porta"
                usage
                exit 1
            fi
            COM_PORT="$2"
            shift 2
            ;;
        --mqtt-broker=*)
            MQTT_BROKER="${1#--mqtt-broker=}"
            shift
            ;;
        --mqtt-broker)
            if [[ $# -lt 2 ]]; then
                err "--mqtt-broker precisa de um host"
                usage
                exit 1
            fi
            MQTT_BROKER="$2"
            shift 2
            ;;
        --mqtt-port=*)
            MQTT_PORT="${1#--mqtt-port=}"
            shift
            ;;
        --mqtt-port)
            if [[ $# -lt 2 ]]; then
                err "--mqtt-port precisa de uma porta"
                usage
                exit 1
            fi
            MQTT_PORT="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            err "Argumento desconhecido: $1"
            usage
            exit 1
            ;;
    esac
done

require_file() {
    if [[ ! -f "$1" ]]; then
        err "Arquivo nao encontrado: $1"
        exit 1
    fi
}

test_python_modules() {
    # Retorna 0 se todos os modulos importarem.
    # Retorna 1 se algum modulo estiver ausente ou quebrado.
    "$PYTHON_BIN" - "$@" >/dev/null 2>&1 <<'PY'
import importlib
import sys

for module in sys.argv[1:]:
    try:
        importlib.import_module(module)
    except Exception:
        sys.exit(1)

sys.exit(0)
PY
}

test_tcp_port() {
    local host="$1"
    local port="$2"

    # Usa Python para evitar diferencas entre nc, timeout e /dev/tcp
    # em Linux/macOS/Git Bash.
    "$PYTHON_BIN" - "$host" "$port" >/dev/null 2>&1 <<'PY'
import socket
import sys

host = sys.argv[1]

try:
    port = int(sys.argv[2])
except ValueError:
    sys.exit(1)

try:
    with socket.create_connection((host, port), timeout=2):
        pass
except OSError:
    sys.exit(1)

sys.exit(0)
PY
}

# --- Pre-requisitos basicos -----------------------------------------------
step "Verificando ferramentas base"

if ! has node; then
    err "Node nao encontrado no PATH"
    exit 1
fi
ok "node $(node --version)"

if ! has npm; then
    err "npm nao encontrado no PATH"
    exit 1
fi
ok "npm $(npm --version)"

PYTHON_BIN=""
for candidate in python3 python py; do
    if has "$candidate"; then
        PYTHON_BIN="$candidate"
        break
    fi
done

if [[ -z "$PYTHON_BIN" ]]; then
    err "Python nao encontrado no PATH"
    exit 1
fi
ok "python ($PYTHON_BIN) $($PYTHON_BIN --version 2>&1)"

# --- Dependencias npm (workspaces supervision) ----------------------------
step "Verificando dependencias npm em supervision/"

if [[ ! -d "$SUPERVISION_DIR/node_modules" ]]; then
    warn "node_modules ausente, rodando npm install (pode demorar)"

    if ! (cd "$SUPERVISION_DIR" && npm install); then
        err "npm install falhou"
        exit 1
    fi
else
    ok "node_modules presente"
fi

# --- Dependencias Python: intelligence ------------------------------------
step "Verificando dependencias Python do motor fuzzy"

require_file "$INTELLIGENCE_DIR/requirements.txt"

if ! test_python_modules numpy; then
    warn "numpy ausente ou quebrado, instalando requirements de intelligence"

    if ! "$PYTHON_BIN" -m pip install -r "$INTELLIGENCE_DIR/requirements.txt"; then
        err "pip install falhou (intelligence)"
        exit 1
    fi
else
    ok "numpy presente"
fi

# --- Dependencias Python: bridge ------------------------------------------
step "Verificando dependencias Python da ponte serial"

require_file "$BRIDGE_DIR/requirements.txt"

if ! test_python_modules paho.mqtt.client serial; then
    warn "paho-mqtt/pyserial ausentes ou quebrados, instalando requirements da bridge"

    if ! "$PYTHON_BIN" -m pip install -r "$BRIDGE_DIR/requirements.txt"; then
        err "pip install falhou (bridge)"
        exit 1
    fi
else
    ok "paho-mqtt + pyserial presentes"
fi

# --- Mosquitto :1883 ------------------------------------------------------
step "Verificando broker Mosquitto em ${MQTT_BROKER}:${MQTT_PORT}"

if test_tcp_port "$MQTT_BROKER" "$MQTT_PORT"; then
    ok "Mosquitto respondendo"
else
    warn "Mosquitto nao responde em ${MQTT_BROKER}:${MQTT_PORT} - server vai logar erro de conexao MQTT ate o broker subir"
fi

# --- Spawn processos filhos -----------------------------------------------
# Bridge fica em background; npm run dev roda em FOREGROUND pra logs do
# server+web aparecerem direto no console e Ctrl+C ser tratado nativamente.

BRIDGE_PID=""
CLEANED_UP=0

cleanup() {
    local exit_code=$?

    if [[ "$CLEANED_UP" -eq 1 ]]; then
        return "$exit_code"
    fi
    CLEANED_UP=1

    if [[ -n "$BRIDGE_PID" ]] && kill -0 "$BRIDGE_PID" 2>/dev/null; then
        echo ""
        step "Derrubando bridge serial"

        if has pkill; then
            pkill -P "$BRIDGE_PID" 2>/dev/null || true
        fi

        kill "$BRIDGE_PID" 2>/dev/null || true
        wait "$BRIDGE_PID" 2>/dev/null || true

        ok "bridge (PID $BRIDGE_PID) derrubado"
    fi

    return "$exit_code"
}

trap cleanup EXIT INT TERM

if [[ "$NO_BRIDGE" -eq 1 ]]; then
    warn "--no-bridge passado, pulando bridge serial (use simulador via /api/simular/iniciar ou ESP32 direto)"
elif [[ -n "$COM_PORT" ]]; then
    step "Subindo bridge serial em $COM_PORT -> $MQTT_BROKER"

    (
        cd "$BRIDGE_DIR"
        "$PYTHON_BIN" bridge.py --port "$COM_PORT" --broker "$MQTT_BROKER"
    ) &

    BRIDGE_PID=$!
    ok "bridge PID $BRIDGE_PID em $COM_PORT"
else
    warn "COM_PORT nao setado, pulando bridge serial (setar via COM_PORT=/dev/ttyUSB0 ou --com-port /dev/ttyUSB0)"
fi

step "Subindo server (:3001) + dashboard (:5173)"
echo ""
printf "%bStack rodando. Abra http://localhost:5173 - Ctrl+C derruba tudo.%b\n" "$C_GREEN" "$C_OFF"
echo ""

# Foreground: output do concurrently (server + web) sai direto pro console.
# Ctrl+C interrompe o npm e dispara o trap pra matar a bridge.
cd "$SUPERVISION_DIR"
npm run dev