# 🔌 Diagnóstico de Saúde de Transformadores

> Projeto Integrador — Microcontroladores  
> Tema 2: Manutenção Preditiva e Diagnóstico Operacional via IoT  
> Engenharia da Computação · UEMA · São Luís, MA · 2026

---

## Visão Geral

Sistema embarcado de monitoramento contínuo para transformadores elétricos, capaz de detectar falhas em desenvolvimento antes que se tornem críticas. O sistema coleta grandezas elétricas, térmicas e mecânicas em tempo real, transmite os dados via MQTT e exibe diagnósticos automáticos em um painel supervisório.

**Problema resolvido:** sistemas comerciais de monitoramento custam entre R$ 15.000 e R$ 80.000. Esta solução utiliza hardware acessível (menos de R$ 200 em componentes) com capacidade equivalente de detecção para instalações de pequeno e médio porte.

---

## Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────┐
│                  CAMADA FÍSICA                       │
│   SCT-013 (P)  SCT-013 (S)  DS18B20  MPU6050        │
└──────────────────────┬──────────────────────────────┘
                       │ sinais analógicos e digitais
┌──────────────────────▼──────────────────────────────┐
│            CAMADA EMBARCADA — ESP32                  │
│         ADC · FFT · Inrush · ΔT · JSON              │
└──────────────────────┬──────────────────────────────┘
                       │ WiFi · MQTT
┌──────────────────────▼──────────────────────────────┐
│          CAMADA DE COMUNICAÇÃO — MQTT                │
│              Broker Mosquitto                        │
└──────────────────────┬──────────────────────────────┘
                       │ paho-mqtt
┌──────────────────────▼──────────────────────────────┐
│       CAMADA DE APLICAÇÃO — Supervision (TS + fuzzy) │
│   Dashboard React · Alertas · Diagnóstico fuzzy      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  SAÍDAS                              │
│         Relatório PDF · Datalogger CSV               │
└─────────────────────────────────────────────────────┘
```

---

## Estrutura do Projeto

O firmware é organizado em módulos independentes — cada sensor tem seu próprio par `.h`/`.cpp` para facilitar manutenção, testes e a divisão de trabalho entre os integrantes da equipe.

```
diagnostico_transformador/
├── src/
│   ├── main.cpp              # Orquestração — setup() e loop()
│   ├── config.h              # Pinos, calibração ADC, tópicos MQTT
│   ├── publicador.h          # Camada de transporte abstrata
│   ├── publicador.cpp        #   Serial no Proteus, MQTT no ESP32
│   ├── mpu6050.h             # Acelerômetro/giroscópio (I²C)
│   ├── mpu6050.cpp
│   ├── ds18b20.h             # Temperatura (OneWire) com cache
│   ├── ds18b20.cpp
│   ├── sct013.h              # Corrente RMS (ADC)
│   ├── sct013.cpp
│   ├── analise_vibracao.h    # Buffer MPU6050 + FFT 120/240Hz
│   ├── analise_vibracao.cpp
│   ├── diagnostico.h         # ΔT, inrush e alarmes
│   └── diagnostico.cpp
├── include/                  # Headers externos (vazio por padrão)
├── lib/                      # Bibliotecas locais
├── proteus/
│   └── MicroProject_3.0.pdsprj  # Projeto de simulação Proteus
├── supervision/                 # Stack de supervisão (TypeScript + Python fuzzy)
│   ├── apps/
│   │   ├── server/              # Express + MQTT subscriber + WebSocket (:3001)
│   │   ├── web/                 # Dashboard React + Vite (:5173)
│   │   └── intelligence/        # Motor fuzzy Python (subprocess)
│   └── packages/shared/         # Tipos e constantes compartilhadas
├── tools/serial_bridge/         # Ponte Serial Proteus → MQTT (Python)
│   ├── bridge.py
│   └── requirements.txt
├── docs/
│   ├── 01-setup.md              # Setup completo do ambiente
│   ├── 02-arquitetura.md        # Arquitetura do firmware
│   ├── 03-mqtt.md               # Protocolo MQTT do projeto
│   ├── 04-padroes-codigo.md     # Convenções
│   ├── 05-pegadinhas-proteus.md # Pegadinhas do simulador
│   ├── ROADMAP.md               # Status do projeto
│   └── Diagnostico_transformador.{tex,pdf}  # Doc técnica LaTeX
├── platformio.ini
└── README.md
```

**Responsabilidades por módulo:**

| Módulo | Faz | Quem cuida |
|---|---|---|
| `config.h` | Define pinos e calibração — detecta plataforma automaticamente | P1 |
| `mpu6050` | Inicialização I²C, leitura de aceleração/giro, conversão para g e °/s | P2 |
| `ds18b20` | OneWire + cache de última leitura válida (tolerância a falhas) | P2 |
| `sct013` | Amostragem ADC, cálculo RMS e leitura instantânea para pico de inrush | P3 |
| `analise_vibracao` | Amostragem incremental do MPU6050 e FFT em 120/240Hz | P3 |
| `diagnostico` | Gradiente ΔT, máquina de estados de inrush e emissão de alarmes | P3/P6 |
| `publicador` | Abstrai transporte — Serial no Proteus, MQTT no ESP32, incluindo alarmes | P4 |
| `main.cpp` | Amarra os módulos no loop não-bloqueante | — |

---

## Hardware

### Componentes Reais (ESP32 — entrega 15/06)

| Componente | Função | Pino ESP32 |
|---|---|---|
| SCT-013-030 | Corrente primário (220V) — clamp não invasivo | GPIO34 (ADC) |
| SCT-013-030 | Corrente secundário (12V) — clamp não invasivo | GPIO35 (ADC) |
| DS18B20 blindado | Temperatura do núcleo | GPIO4 (OneWire) |
| MPU6050 | Vibração mecânica do chassi | GPIO21/22 (I²C) |

### Componentes de Simulação (Arduino UNO — Proteus — entrega 18/05)

| Componente real | Substituto no Proteus | Motivo |
|---|---|---|
| SCT-013 | VSINE 60Hz + R 100Ω + C 10µF + divisor 10k+10k | Sensor não existe na biblioteca do Proteus |
| ESP32 | Arduino UNO R3 V3.0 | ESP32 não disponível no Proteus |
| MPU6050 | MPU6050 (biblioteca ElectronicTree) | Biblioteca de terceiro necessária |
| DS18B20 | DS18B20 (biblioteca padrão, com timings ajustados) | Disponível nativamente |

---

## Como o Transformador é Simulado

O SCT-013 é um transformador de corrente não invasivo que, na prática, produz uma corrente proporcional à corrente que circula no fio monitorado. Essa corrente é convertida em tensão por um resistor burden e condicionada para o ADC.

Como o Proteus não possui o SCT-013, o sinal já condicionado que chegaria ao ADC é reproduzido diretamente por um circuito gerador:

```
                    ┌── R_top (10kΩ) ── 5V
                    │
VSINE ── R(100Ω) ── C(10µF) ── nó central ──── A0 / A1
                    │
                    └── R_bot (10kΩ) ── GND
```

**O que cada parte faz:**

| Elemento | Papel |
|---|---|
| VSINE 60Hz | Representa o sinal AC da corrente no fio — mesma frequência da rede |
| R 100Ω | Simula o resistor burden do SCT-013 real (limita corrente) |
| C 10µF | Acoplamento AC — remove offset DC da fonte, deixa passar só o sinal alternado |
| Divisor 10k+10k | Gera 2,5V de bias no nó central — necessário porque o ADC do Arduino não lê tensões negativas |
| Nó central | Ponto onde o sinal AC se soma ao bias de 2,5V, resultando em uma senoide entre ~1,5V e ~3,5V |

**Amplitudes configuradas:**

| Canal | Amplitude VSINE | V_rms esperado | Representa |
|---|---|---|---|
| A0 — Primário | 1,0 V | ~0,707 V | Corrente maior no lado 220V |
| A1 — Secundário | 0,5 V | ~0,354 V | Corrente menor no lado 12V |

A diferença de amplitude entre os canais simula o fato de que o primário (220V) induz mais corrente no SCT-013 do que o secundário (12V), proporcionalmente à relação de transformação do equipamento monitorado.

**Importante:** as VSINEs Primário/Secundário são simuladores **independentes** do sinal já condicionado que sairia do SCT-013. Elas **não devem ser conectadas** ao transformador TR1 do esquemático. O TR1 fica isolado como ilustração conceitual. Detalhes em [`docs/05-pegadinhas-proteus.md`](./docs/05-pegadinhas-proteus.md).

**Por que funciona:** o cálculo RMS no firmware extrai exatamente o que importa para o diagnóstico — a magnitude eficaz do sinal de corrente. No hardware físico, o mesmo código lê o sinal real do SCT-013. A única diferença entre simulação e realidade é a origem do sinal no pino analógico.

---

## Estratégia MQTT — Simulação vs Hardware Físico

O Proteus não simula WiFi nem stack TCP/IP, então **não dá para falar MQTT de verdade na simulação**. O projeto contorna isso com uma **camada de transporte abstrata** (`publicador.h/cpp`) que apresenta a mesma interface nos dois ambientes:

```cpp
publicador::publicar("transformador/nucleo/temperatura", 26.5, "C");
```

**No Proteus (Arduino UNO):** imprime no Serial em formato compatível com MQTT.  
**No ESP32 físico:** publica no broker MQTT real via PubSubClient.

A seleção entre os dois caminhos é automática, controlada por `#if defined(ESP32)`. O código de aquisição e processamento é idêntico nos dois ambientes — só a camada de saída muda.

**Saída no Virtual Terminal (Proteus):**

```
[MQTT] transformador/nucleo/temperatura -> {"ts":4,"valor":26.5000,"unidade":"C"}
[MQTT] transformador/nucleo/delta_t -> {"ts":4,"valor":1.5000,"unidade":"C"}
[MQTT] transformador/primario/corrente -> {"ts":4,"valor":0.6914,"unidade":"Vrms"}
[MQTT] transformador/secundario/corrente -> {"ts":4,"valor":0.3461,"unidade":"Vrms"}
[MQTT] transformador/vibracao/aceleracao -> {"ts":4,"valor":0.0000,"unidade":"g"}
[MQTT] transformador/vibracao/fft_120hz -> {"ts":4,"valor":0.0000,"unidade":"g"}
[MQTT] transformador/vibracao/fft_240hz -> {"ts":4,"valor":0.0000,"unidade":"g"}
[MQTT] transformador/vibracao/espectro -> {"ts":4,"espectro":[{"freq":16,"amplitude":0.0012},...]}
[MQTT] transformador/status/heartbeat -> {"ts":4,"valor":4.0000,"unidade":"s"}
```

Esse é literalmente o payload que será publicado no broker no hardware físico. Toda a estrutura — hierarquia de tópicos, formato JSON, timestamp — está validada já na simulação.

### Ponte Serial→MQTT para demonstrações

Como o Proteus não tem stack TCP/IP, o script `tools/serial_bridge/bridge.py` faz a ponte: lê a porta COM virtual exposta pelo componente **COMPIM** do esquemático, extrai os payloads das linhas `[MQTT]` via regex, reescreve o `ts` para timestamp Unix e republica no broker Mosquitto local. O servidor da pasta `supervision/` então consome o broker e propaga para o dashboard via WebSocket. Detalhes em [`docs/01-setup.md`](./docs/01-setup.md) e [`docs/03-mqtt.md`](./docs/03-mqtt.md).

---

## Mapeamento de Pinos: Simulação → Hardware Físico

| Função | Arduino UNO (Proteus) | ESP32 (físico) | Observação |
|---|---|---|---|
| SCT-013 Primário | A0 | GPIO34 | Input-only no ESP32, sem pull-up interno |
| SCT-013 Secundário | A1 | GPIO35 | Input-only, ideal para ADC |
| DS18B20 (OneWire) | D4 | GPIO4 | Mesmo número por conveniência |
| MPU6050 SDA | A4 | GPIO21 | Wire.h funciona igual nos dois |
| MPU6050 SCL | A5 | GPIO22 | Wire.h funciona igual nos dois |
| Serial TX | D1/TXD | GPIO1 (USB-Serial) | Virtual Terminal + COMPIM no Proteus |

> **Nota:** A troca entre plataformas não exige modificações manuais no código. O arquivo `config.h` detecta a plataforma de compilação via `#if defined(ESP32)` e ajusta automaticamente `VREF` (5V → 3,3V), `ADC_RES` (1023 → 4095) e `BIAS` (2,5V → 1,65V).

---

## Tópicos MQTT

| Tópico | Dado | Unidade |
|---|---|---|
| `transformador/primario/corrente` | Corrente RMS primário | Vrms |
| `transformador/primario/inrush` | Pico instantâneo detectado no primário | Vpico no Proteus / A no hardware calibrado |
| `transformador/secundario/corrente` | Corrente RMS secundário | Vrms |
| `transformador/nucleo/temperatura` | Temperatura absoluta | °C |
| `transformador/nucleo/delta_t` | Gradiente térmico | °C |
| `transformador/vibracao/aceleracao` | Aceleração eixo Z | g |
| `transformador/vibracao/fft_120hz` | Amplitude no bin próximo a 120Hz | g |
| `transformador/vibracao/fft_240hz` | Amplitude no bin próximo a 240Hz | g |
| `transformador/vibracao/espectro` | Amplitudes nas 5 harmônicas pedidas pelo professor: 120, 240, 360, 480, 600Hz | g por bin |
| `transformador/status/alarme` | JSON estruturado com `tipo`, `severidade`, `valor`, `limite`, `mensagem` | — |
| `transformador/status/heartbeat` | Uptime do firmware (UNO) ou Unix time (ESP32) | s |

**Formato do payload:**

```json
{
  "ts": 1748000000,
  "valor": 26.5,
  "unidade": "C"
}
```

**Formato do payload de alarme:**

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

**Formato do payload de espectro:**

```json
{
  "ts": 1748000000,
  "espectro": [
    { "freq": 120, "amplitude": 0.1840 },
    { "freq": 240, "amplitude": 0.0921 },
    { "freq": 360, "amplitude": 0.0410 },
    { "freq": 480, "amplitude": 0.0152 },
    { "freq": 600, "amplitude": 0.0078 }
  ]
}
```

> FFT atual: 32 amostras @ 1920Hz → resolução 60Hz/bin, múltiplos de 120Hz caem exatos em bins pares sem leakage (120→2, 240→4, 360→6, 480→8, 600→10). N=32 ajusta a memória do AVR (N=64 saturava a RAM e travava o firmware no Proteus). Por decisão do projeto (pedido do professor), publicamos só as 5 harmônicas relevantes — fundamental de magnetostrição (120Hz) e as 4 harmônicas seguintes (240, 360, 480, 600Hz). Reduz banda na serial 9600 do Proteus.

---

## Como Rodar — Pipeline Completo (Simulação Proteus → Dashboard)

> Tutorial passo-a-passo detalhado em [`docs/01-setup.md`](./docs/01-setup.md). Abaixo está o fluxo macro.

### Pré-requisitos (instalar uma vez)

- **PlatformIO** (extensão VSCode) com Proteus 8.x + biblioteca MPU6050 da [ElectronicTree](https://electronicstree.com/new-mpu6050-proteus-library/)
- **Mosquitto** rodando em `localhost:1883` com `allow_anonymous true`
- **com0com** (Windows) ou **socat** (Linux) — par de portas COM virtuais para a ponte Serial→MQTT
- **Node.js 20+** e **Python 3.10+** para a stack `supervision/` e a ponte
- Bibliotecas firmware já listadas em [`platformio.ini`](./platformio.ini)

### Passo a passo

1. **Compilar firmware:** abrir o projeto no VSCode → `pio run -e uno` → `.hex` sai em `.pio/build/uno/firmware.hex`.
2. **Carregar no Proteus:** abrir `proteus/MicroProject_3.0.pdsprj` → clique duplo no Arduino UNO → campo **Program File** → apontar para o `.hex`.
3. **Configurar COMPIM no esquemático:** componente `COMPIM` conectado ao TXD do Arduino (TXD do UNO ligado ao **TXD do COMPIM** — não RXD), propriedade `Physical port` apontando para uma das pontas do par virtual (ex.: `COM4`), baud `9600` (limite prático do simulador Proteus — silício real do UNO suporta 115200, mas a simulação perde bits).
4. **Subir a ponte:** `python tools/serial_bridge/bridge.py --port COM5 --baud 9600 --broker localhost` — lê a outra ponta do par virtual e republica no broker.
5. **Subir o servidor de supervisão:** `cd supervision && npm install && npm run dev` — sobe Express :3001 + Vite :5173.
6. **Dar Play no Proteus.** Em ~2s, dados começam a fluir do Proteus → ponte → broker → server → dashboard.
7. **Abrir o dashboard:** `http://localhost:5173`. Cards de temperatura, ΔT, correntes, vibração e espectro FFT começam a atualizar em tempo real. Diagnóstico fuzzy roda a cada ciclo.

### Validação intermediária

| Etapa | Comando de validação | Esperado |
|---|---|---|
| Mosquitto ok | `mosquitto_pub -h localhost -t teste -m ping` + `mosquitto_sub -h localhost -t teste -v` em outro terminal | Mensagem aparece no `_sub` |
| com0com ok | escrever em uma ponta, ler na outra com `pyserial` | Bytes idênticos |
| COMPIM ok | `mosquitto_sub -h localhost -t "transformador/#" -v` durante Play do Proteus + ponte rodando | Tópicos chegando em tempo real |
| Dashboard ok | abrir `http://localhost:5173` | Cards ativos sem disparar o simulador (`/api/simular/iniciar`) |

### Saída esperada no Virtual Terminal

```
===================================
   DIAGNOSTICO DE TRANSFORMADOR
===================================
[MPU6050] OK
[DS18B20] Sensores detectados: 1
[SCT-013] A0=primario  A1=secundario
-----------------------------------
[MQTT] transformador/primario/corrente -> {"ts":4,"valor":0.6914,"unidade":"Vrms"}
[MQTT] transformador/secundario/corrente -> {"ts":4,"valor":0.3461,"unidade":"Vrms"}
[MQTT] transformador/vibracao/aceleracao -> {"ts":4,"valor":0.0000,"unidade":"g"}
[MQTT] transformador/nucleo/temperatura -> {"ts":4,"valor":26.5000,"unidade":"C"}
[MQTT] transformador/nucleo/delta_t -> {"ts":4,"valor":1.5000,"unidade":"C"}
[MQTT] transformador/vibracao/fft_120hz -> {"ts":4,"valor":0.0000,"unidade":"g"}
[MQTT] transformador/vibracao/fft_240hz -> {"ts":4,"valor":0.0000,"unidade":"g"}
-----------------------------------
```

---

## Como Rodar — Hardware Físico (ESP32)

### Compilação

O ambiente `env:esp32` já está em `platformio.ini`. No rodapé do VSCode, alterne entre `env:uno` (simulação) e `env:esp32` (físico). **Nenhuma alteração manual no código é necessária** — o `config.h` detecta a plataforma automaticamente.

Antes de gravar no ESP32, ajustar as credenciais WiFi e o IP do broker em `src/publicador.cpp`:

```cpp
constexpr const char* WIFI_SSID   = "SUA_REDE";
constexpr const char* WIFI_PASS   = "SUA_SENHA";
constexpr const char* MQTT_BROKER = "192.168.1.100";
```

O firmware já chama `mqtt.setBufferSize(1024)` em `iniciar()` para acomodar o payload de espectro.

### Broker Mosquitto

```bash
# Ubuntu/Debian
sudo apt install mosquitto mosquitto-clients
echo "listener 1883\nallow_anonymous true" | sudo tee /etc/mosquitto/conf.d/local.conf
sudo systemctl restart mosquitto

# Verificar recebimento dos dados do ESP32
mosquitto_sub -h localhost -t "transformador/#" -v
```

No ESP32, a ponte Serial→MQTT **não é necessária** — o firmware fala MQTT direto com o broker. A stack `supervision/` ingere o broker do mesmo jeito que faz na simulação. Pipeline simplificado: ESP32 → Mosquitto → server → dashboard.

---

## Limitações Conhecidas da Simulação

As limitações específicas do Proteus e seus workarounds estão documentadas em [`docs/05-pegadinhas-proteus.md`](./docs/05-pegadinhas-proteus.md) — incluindo configuração do modelo do DS18B20, comportamento do MPU6050, estratégia de isolamento do TR1, e como contornar a ausência de WiFi/MQTT na simulação.

---

## Divisão de Tarefas

| Pessoa | Responsabilidade | Entrega verificável |
|---|---|---|
| P1 — Hardware | Circuito físico, condicionamento SCT-013, pinagem ESP32 | Sinal condicionado mensurável no osciloscópio |
| P2 — Firmware Base | Módulos `mpu6050`, `ds18b20`, código não-bloqueante | Leituras estáveis no Virtual Terminal sem `delay()` |
| P3 — DSP & Algoritmos | Módulos `sct013`, `analise_vibracao`, FFT 120Hz, detecção Inrush, gradiente ΔT | Espectro vibracional e flag de Inrush funcionando |
| P4 — IoT & MQTT | Módulo `publicador`, broker Mosquitto, JSON com timestamp e alarmes | ESP32 publicando nos tópicos, testável com `mosquitto_sub` |
| P5 — Supervision (Frontend) | Dashboard React (`supervision/apps/web`), gráficos, espectro FFT, alertas | Painel atualizando ao vivo via WebSocket |
| P6 — Supervision (Backend + Diagnóstico) | Server Express, MQTT subscriber, persistência SQLite+CSV, motor fuzzy Python, relatório PDF | Server consumindo o broker, fuzzy emitindo diagnósticos, PDF exportável |

---

## Cronograma

| Data | Avaliação | Status |
|---|---|---|
| 18/05/2026 | 2ª Avaliação — Simulação Proteus | 🔄 Em andamento |
| 15/06/2026 | 3ª Avaliação — Protótipo físico + IHM integrada | ⏳ Pendente |

---

## Referências

- IEEE Std C57.91-2011 — *Guide for Loading Mineral-Oil-Immersed Transformers*
- ABNT NBR 5356-1:2007 — *Transformadores de potência*
- Espressif — [ESP32 Technical Reference Manual](https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf)
- ElectronicTree — [MPU6050 Proteus Library](https://electronicstree.com/new-mpu6050-proteus-library/)
- OpenEnergyMonitor — [CT Sensors: Interfacing with Arduino](https://learn.openenergymonitor.org/electricity-monitoring/ct-sensors/)
- HiveMQ — [MQTT Essentials](https://www.hivemq.com/mqtt-essentials/)
