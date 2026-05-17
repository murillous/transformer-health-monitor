# 📡 Guia MQTT

Como o sistema comunica os dados dos sensores via MQTT — tópicos, payloads, broker, ponte para o Proteus e ingestão pelo servidor de supervisão.

---

## O que é MQTT (em 1 minuto)

Protocolo leve publish/subscribe ideal para IoT:

```
Firmware ──► Broker (Mosquitto) ──► Subscribers (server supervision, mosquitto_sub, MQTT Explorer…)
```

- O **firmware** publica em **tópicos** (strings hierárquicas).
- O **broker** distribui as mensagens.
- Os **subscribers** se inscrevem nos tópicos que interessam.

Diferente de HTTP, cliente e servidor não precisam estar online ao mesmo tempo — o broker faz buffer.

---

## Estrutura dos tópicos

```
transformador/
├── primario/
│   ├── corrente          ← RMS da corrente no enrolamento de 220V (Vrms)
│   └── inrush            ← pico de surto de energização (Vpico no Proteus / A no físico)
├── secundario/
│   └── corrente          ← RMS da corrente no enrolamento de 12V (Vrms)
├── nucleo/
│   ├── temperatura       ← °C absolutos
│   └── delta_t           ← gradiente térmico °C
├── vibracao/
│   ├── aceleracao        ← g no eixo Z (bruto)
│   ├── fft_120hz         ← amplitude no bin próximo a 120Hz
│   ├── fft_240hz         ← amplitude no bin próximo a 240Hz
│   └── espectro          ← 5 harmônicas alvo: 120, 240, 360, 480, 600Hz
└── status/
    ├── alarme            ← eventos críticos com severidade
    └── heartbeat         ← uptime (UNO) ou Unix time (ESP32)

onda_corrente_primario     ← burst de 32 amostras @ 1kHz (forma de onda do A0)
onda_corrente_secundario   ← burst de 32 amostras @ 1kHz (forma de onda do A1)
```

**Por que essa organização:**

- **Subscribe seletivo:** `transformador/#` (tudo) ou `transformador/nucleo/+` (todas as temperaturas).
- **Escalabilidade:** se um dia monitorarmos vários transformadores, basta um identificador: `transformador/T01/...`.
- **Legibilidade:** o tópico sozinho já comunica o significado.

---

## Formatos de payload

### Escalar (a maioria dos tópicos)

```json
{
  "ts": 1748000000,
  "valor": 26.5,
  "unidade": "C"
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `ts` | inteiro | Unix time (definido pelo ESP32 ou reescrito pela ponte serial no Proteus) |
| `valor` | float | Valor medido, 4 casas decimais |
| `unidade` | string | Unidade física (`C`, `Vrms`, `Vpico`, `g`, `A`, `s`) |

### Alarme (`transformador/status/alarme`)

```json
{
  "ts": 1748000000,
  "tipo": "vibracao_120hz",
  "severidade": "aviso",
  "valor": 0.42,
  "limite": 0.20,
  "mensagem": "Vibracao em 120Hz acima do limite"
}
```

Severidade é sempre `"aviso"` ou `"critico"`. O server traduz para o campo interno `sev` ao persistir no SQLite (decisão histórica — banco já existia com schema `sev` antes do firmware publicar `severidade`).

### Espectro (`transformador/vibracao/espectro`)

```json
{
  "ts": 1748000000,
  "espectro": [
    { "freq": 16,  "amplitude": 0.0012 },
    { "freq": 31,  "amplitude": 0.0024 },
    { "freq": 47,  "amplitude": 0.0019 },
    { "freq": 125, "amplitude": 0.1840 },
    { "freq": 234, "amplitude": 0.0921 }
  ]
}
```

5 harmônicas extraídas do FFT do `analise_vibracao` (32 amostras @ 1920Hz, resolução 60Hz/bin — múltiplos de 120Hz caem em bins pares sem leakage: 120→bin 2, 240→bin 4, 360→bin 6, 480→bin 8, 600→bin 10). N=32 é o teto prático para o AVR — N=64 satura a RAM e trava o firmware no simulador. O firmware extrai só as 5 frequências de interesse (pedido do professor) via `amplitudeEmFreq()`. Payload cabe em ~180 chars — folga grande nos 9600 baud do Proteus. O dashboard aplica suavização EMA (α=0.35) e marca linhas de referência nas 5 harmônicas.

---

## A camada `publicador` no firmware

Toda publicação passa por uma função única:

```cpp
publicador::publicar("transformador/nucleo/temperatura", 26.5, "C");
publicador::publicarAlarme("vibracao_120hz", "aviso", 0.42, 0.20, "Vibracao acima do limite");

const int   freqs[] = {120, 240, 360, 480, 600};
const float amps[]  = {0.18f, 0.09f, 0.04f, 0.02f, 0.01f};
publicador::publicarEspectro(TOPICO_ESPECTRO, freqs, amps, 5);
```

A função encapsula o JSON e seleciona automaticamente entre **Serial** (Proteus) e **MQTT** (ESP32) via `#if defined(ESP32)`.

Detalhes de implementação do espectro:
- **UNO:** stream direto pelo `Serial.print` — sem buffer grande na RAM (AVR só tem 2KB).
- **ESP32:** monta `char payload[400]` único e chama `mqtt.publish()`. Em `iniciar()` chama `mqtt.setBufferSize(512)` (folga pra payload de ~180 chars com 5 harmônicas).

---

## Broker Mosquitto

### Instalação

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install mosquitto mosquitto-clients

# macOS
brew install mosquitto

# Windows
# Instalador em https://mosquitto.org/download
```

### Permitir conexões da rede local

Por padrão, o Mosquitto só aceita conexões de `localhost`. Para o ESP32 conectar:

**Linux:**
```bash
sudo tee /etc/mosquitto/conf.d/local.conf <<EOF
listener 1883
allow_anonymous true
EOF
sudo systemctl restart mosquitto
```

**Windows:** editar `C:\Program Files\mosquitto\mosquitto.conf`:
```
listener 1883
allow_anonymous true
```
E reiniciar o serviço (`Restart-Service mosquitto` no PowerShell admin).

### Validação

```bash
# Terminal 1
mosquitto_sub -h localhost -t "transformador/#" -v

# Terminal 2
mosquitto_pub -h localhost -t "transformador/teste" -m '{"ts":1,"valor":42,"unidade":"X"}'
```

Terminal 1 deve mostrar imediatamente:
```
transformador/teste {"ts":1,"valor":42,"unidade":"X"}
```

---

## Ingestão pelo server `supervision`

`supervision/apps/server/src/mqtt/subscriber.ts` se conecta ao broker, subscreve em `TOPICOS_INSCREVER` (derivado automaticamente de `TOPICOS_MQTT` em `packages/shared/src/constants.ts`) e:

- Para `transformador/status/alarme` — parseia o payload do firmware (com `severidade`) e persiste como `AlarmeMQTT` (com `sev`).
- Para `transformador/vibracao/espectro` — passa o array `espectro` direto para o WebSocket sem validar como leitura escalar.
- Para todos os demais tópicos — valida contra `leituraSchema` e persiste como `Registro` (SQLite + CSV).

Cada mensagem dispara `wsHub.broadcast()` para o frontend.

Para desligar a ingestão MQTT e rodar só o UI com dados sintéticos (`/api/simular/iniciar`):

```bash
cd supervision
npm run dev:server:offline   # equivale a MQTT_BROKER=none
```

---

## Estratégia para a simulação Proteus (sem WiFi)

O Proteus não simula WiFi, então o Arduino UNO **não fala MQTT diretamente**. A ponte resolve isso:

### Pipeline

```
UNO Serial (TXD) ── COMPIM ── COM4 ── par com0com ── COM5 ── bridge.py ── Mosquitto
```

1. O firmware imprime no `Serial` em formato `[MQTT] topico -> {JSON}` (camada `publicador`).
2. O componente **COMPIM** do Proteus expõe essa serial como uma porta COM real do Windows (`COM4`).
3. **com0com** (Windows) ou **socat** (Linux) cria um par de COMs virtuais espelhadas (`COM4` ↔ `COM5`).
4. O script `tools/serial_bridge/bridge.py` lê a outra ponta (`COM5`), extrai os payloads via regex, reescreve `ts` para timestamp Unix da máquina e publica no Mosquitto.
5. O server `supervision` ingere o broker normalmente — não há nenhuma diferença vista do dashboard entre dados vindos do Proteus e dados vindos do ESP32 físico.

### Detalhes do COMPIM

- **TXD do Arduino → TXD do COMPIM**, não RXD. O COMPIM é uma ponte para o host, e seu TXD funciona como entrada do circuito simulado.
- Propriedade `Physical port` aponta para uma ponta do par (ex.: `COM4`), baud `9600` no UNO (limite prático do simulador Proteus). Constante centralizada em `config.h::BAUD_SERIAL` — ESP32 usa 115200.
- Outro programa com `COM4` aberta = COMPIM falha silencioso. Fechar Arduino IDE, PuTTY, outras instâncias.

### Detalhes do com0com

- Versão signed do com0com necessária. No Windows 11, pode ser preciso **desativar Secure Boot** na UEFI para o driver instalar.
- Criar o par com `install PortName=COM4 PortName=COM5` no Setup Command Prompt do com0com.

### Esqueleto do bridge

```python
import re, json, time, serial
import paho.mqtt.client as mqtt

PADRAO = re.compile(r'\[MQTT\] (\S+) -> (.+)')

ser = serial.Serial("COM5", 9600, timeout=1)
cli = mqtt.Client()
cli.connect("localhost", 1883)
cli.loop_start()

while True:
    linha = ser.readline().decode(errors="ignore").strip()
    m = PADRAO.match(linha)
    if not m:
        continue
    topico, payload = m.group(1), m.group(2)
    # Reescreve uptime do Arduino → Unix time
    dados = json.loads(payload)
    if "ts" in dados:
        dados["ts"] = int(time.time())
        payload = json.dumps(dados, separators=(",", ":"))
    cli.publish(topico, payload)
```

Versão completa em [`tools/serial_bridge/bridge.py`](../tools/serial_bridge/bridge.py).

---

## QoS (Quality of Service) — quando importa

MQTT tem 3 níveis de garantia de entrega:

| QoS | Significado | Quando usar |
|---|---|---|
| 0 | Fire-and-forget | Leituras periódicas — perder uma não é problema |
| 1 | Pelo menos uma vez | Alarmes — não pode perder |
| 2 | Exatamente uma vez | Quase nunca necessário |

Recomendação para o projeto:

```cpp
mqtt.publish("transformador/primario/corrente", payload);              // QoS 0
mqtt.publish("transformador/status/alarme", payload, true);            // retained = true
```

O `retained=true` no tópico de alarme guarda o último valor no broker. Quando o server conectar, recebe imediatamente o último estado.

---

## Debug rápido

| Sintoma | Causa provável |
|---|---|
| `mosquitto_sub` vazio, bridge silenciosa | Proteus parado, COMPIM mal cabeado, ou TXD trocado com RXD |
| `mosquitto_sub` vazio, bridge imprime `[skip]` | Firmware imprimindo formato diferente — checar `publicador.cpp:52-55` |
| Bridge ok, server não loga "MQTT conectado" | `npm run dev` ainda com `MQTT_BROKER=none` ou broker em host errado |
| Server loga conectado, dashboard parado | Frontend não rebuildou — `Ctrl+C` e `npm run dev` de novo |
| `Payload inválido no tópico ...` no server | Bridge republicando texto cru ou Proteus emitindo lixo |
| Espectro vazio no dashboard | Firmware antigo (sem `publicarEspectro`) ainda carregado — recompilar e gravar `.hex` novo |

---

## Recursos externos

- [HiveMQ MQTT Essentials](https://www.hivemq.com/mqtt-essentials/) — tutorial oficial bem feito
- [Mosquitto docs](https://mosquitto.org/documentation/) — referência do broker
- [paho-mqtt (Python)](https://www.eclipse.org/paho/index.php?page=clients/python/index.php) — biblioteca da ponte
- [mqtt (npm)](https://www.npmjs.com/package/mqtt) — biblioteca do server
- [MQTT Explorer](http://mqtt-explorer.com/) — GUI para inspecionar o broker (super útil para debug)
