<#
.SYNOPSIS
    Sobe a stack completa de supervisao do Transformer Health Monitor.

.DESCRIPTION
    Verifica dependencias (Node, Python, npm packages, pip packages),
    instala o que faltar, checa o broker Mosquitto, sobe a ponte
    Serial->MQTT (se COM_PORT setado) e o server + dashboard.

    Ctrl+C derruba todos os processos filhos.

.PARAMETER ComPort
    Porta serial do COMPIM (ex.: COM5). Se omitido, le de $env:COM_PORT.
    Se nem o env nem o parametro existirem, a ponte serial NAO sobe
    (modo simulador interno ou ESP32 direto no broker).

.EXAMPLE
    .\scripts\start.ps1
    .\scripts\start.ps1 -ComPort COM5
    $env:COM_PORT = "COM5"; .\scripts\start.ps1
#>

[CmdletBinding()]
param(
    # Default COM5 = par com0com padrao documentado em docs/01-setup.md
    # (COMPIM escreve em COM4, bridge le em COM5). Sobrescreva via env
    # COM_PORT, via -ComPort COMx, ou desligue com -NoBridge.
    [string]$ComPort = ($(if ($PSBoundParameters.ContainsKey("ComPort")) { $null }
                          elseif ($env:COM_PORT) { $env:COM_PORT }
                          else { "COM5" })),
    [switch]$NoBridge,
    [string]$MqttBroker = ($(if ($env:MQTT_BROKER) { $env:MQTT_BROKER } else { "localhost" })),
    [int]$MqttPort = 1883
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$supervisionDir  = Join-Path $repoRoot "supervision"
$intelligenceDir = Join-Path $supervisionDir "apps/intelligence"
$bridgeDir       = Join-Path $repoRoot "tools/serial_bridge"

function Write-Step($msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "    OK $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "    !! $msg" -ForegroundColor Yellow }
function Write-Err2($msg)  { Write-Host "    XX $msg" -ForegroundColor Red }

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Test-PythonModules {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Modules
    )

    $oldErrorActionPreference = $ErrorActionPreference

    $hasNativePreference = Test-Path Variable:\PSNativeCommandUseErrorActionPreference
    if ($hasNativePreference) {
        $oldNativePreference = $PSNativeCommandUseErrorActionPreference
    }

    $code = @'
import importlib
import sys

for module in sys.argv[1:]:
    try:
        importlib.import_module(module)
    except Exception:
        sys.exit(1)

sys.exit(0)
'@

    try {
        # Import ausente/quebrado deve retornar falso, nao derrubar o script.
        $ErrorActionPreference = "Continue"

        # PowerShell 7+ pode transformar exit code != 0 de comandos nativos
        # em erro terminante quando esta preferencia esta ativa.
        if ($hasNativePreference) {
            $PSNativeCommandUseErrorActionPreference = $false
        }

        & $pythonBin -c $code @Modules *> $null

        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $oldErrorActionPreference

        if ($hasNativePreference) {
            $PSNativeCommandUseErrorActionPreference = $oldNativePreference
        }
    }
}

# --- Pre-requisitos basicos -----------------------------------------------
Write-Step "Verificando ferramentas base"

if (-not (Test-Command node)) {
    Write-Err2 "Node nao encontrado no PATH"
    exit 1
}
Write-Ok ("node {0}" -f (& node --version))

if (-not (Test-Command npm)) {
    Write-Err2 "npm nao encontrado no PATH"
    exit 1
}
Write-Ok ("npm {0}" -f (& npm --version))

$pythonBin = $null
foreach ($candidate in @("python", "python3", "py")) {
    if (Test-Command $candidate) {
        $pythonBin = $candidate
        break
    }
}

if (-not $pythonBin) {
    Write-Err2 "Python nao encontrado no PATH"
    exit 1
}
Write-Ok ("python ({0}) {1}" -f $pythonBin, (& $pythonBin --version 2>&1))

# --- Dependencias npm (workspaces supervision) ----------------------------
Write-Step "Verificando dependencias npm em supervision/"

$nodeModules = Join-Path $supervisionDir "node_modules"

if (-not (Test-Path $nodeModules)) {
    Write-Warn2 "node_modules ausente, rodando npm install (pode demorar)"

    Push-Location $supervisionDir
    try {
        & npm install
    } finally {
        Pop-Location
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Err2 "npm install falhou"
        exit 1
    }
} else {
    Write-Ok "node_modules presente"
}

# --- Dependencias Python: intelligence ------------------------------------
Write-Step "Verificando dependencias Python do motor fuzzy"

$intelReq = Join-Path $intelligenceDir "requirements.txt"

if (-not (Test-PythonModules @("numpy"))) {
    Write-Warn2 "numpy ausente ou quebrado, instalando requirements de intelligence"

    & $pythonBin -m pip install -r $intelReq

    if ($LASTEXITCODE -ne 0) {
        Write-Err2 "pip install falhou (intelligence)"
        exit 1
    }
} else {
    Write-Ok "numpy presente"
}

# --- Dependencias Python: bridge ------------------------------------------
Write-Step "Verificando dependencias Python da ponte serial"

$bridgeReq = Join-Path $bridgeDir "requirements.txt"

if (-not (Test-PythonModules @("paho.mqtt.client", "serial"))) {
    Write-Warn2 "paho-mqtt/pyserial ausentes ou quebrados, instalando requirements da bridge"

    & $pythonBin -m pip install -r $bridgeReq

    if ($LASTEXITCODE -ne 0) {
        Write-Err2 "pip install falhou (bridge)"
        exit 1
    }
} else {
    Write-Ok "paho-mqtt + pyserial presentes"
}

# --- Mosquitto :1883 ------------------------------------------------------
Write-Step "Verificando broker Mosquitto em ${MqttBroker}:${MqttPort}"

$tcp = New-Object System.Net.Sockets.TcpClient

try {
    $iar = $tcp.BeginConnect($MqttBroker, $MqttPort, $null, $null)
    $ready = $iar.AsyncWaitHandle.WaitOne(2000)

    if ($ready -and $tcp.Connected) {
        $tcp.EndConnect($iar) | Out-Null
        Write-Ok "Mosquitto respondendo"
    } else {
        Write-Warn2 "Mosquitto nao responde em ${MqttBroker}:${MqttPort} - server vai logar erro de conexao MQTT ate o broker subir"
    }
} catch {
    Write-Warn2 "Erro testando Mosquitto: $($_.Exception.Message)"
} finally {
    $tcp.Close()
}

# --- Spawn processos filhos -----------------------------------------------
# Bridge fica em background (-NoNewWindow herda console mas pode atrasar
# output); npm run dev roda em FOREGROUND pra logs do server+web aparecerem
# direto na console e Ctrl+C ser tratado nativamente.

$bridgeProc = $null

if ($NoBridge) {
    Write-Warn2 "-NoBridge passado, pulando bridge serial (use simulador via /api/simular/iniciar ou ESP32 direto)"
} elseif ($ComPort) {
    Write-Step "Subindo bridge serial em $ComPort -> $MqttBroker"

    $bridgeProc = Start-Process -FilePath $pythonBin `
        -ArgumentList @("bridge.py", "--port", $ComPort, "--broker", $MqttBroker) `
        -WorkingDirectory $bridgeDir `
        -NoNewWindow `
        -PassThru

    Write-Ok ("bridge PID {0} em {1}" -f $bridgeProc.Id, $ComPort)
} else {
    Write-Warn2 "COM_PORT vazio, pulando bridge serial"
}

Write-Step "Subindo server (:3001) + dashboard (:5173)"
Write-Host ""
Write-Host "Stack rodando. Abra http://localhost:5173 - Ctrl+C derruba tudo." -ForegroundColor Green
Write-Host ""

try {
    Push-Location $supervisionDir

    try {
        # Foreground: output do concurrently (server + web) sai direto pro console.
        # Ctrl+C aqui interrompe o npm e cai no finally externo pra cleanup.
        & npm run dev
    } finally {
        Pop-Location
    }
} finally {
    if ($bridgeProc -and -not $bridgeProc.HasExited) {
        Write-Host ""
        Write-Step "Derrubando bridge serial"

        try {
            # Mata netos primeiro (python -> subprocess) e depois o pai.
            Get-CimInstance Win32_Process -Filter "ParentProcessId=$($bridgeProc.Id)" -ErrorAction SilentlyContinue |
                ForEach-Object {
                    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                }

            Stop-Process -Id $bridgeProc.Id -Force -ErrorAction SilentlyContinue

            Write-Ok ("bridge (PID {0}) derrubado" -f $bridgeProc.Id)
        } catch {
            Write-Warn2 ("Falha ao derrubar bridge: {0}" -f $_.Exception.Message)
        }
    }
}