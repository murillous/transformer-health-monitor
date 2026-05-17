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
│         CAMADA DE APLICAÇÃO — IHM Python             │
│       Dashboard · Alertas · Lógica de diagnóstico    │
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
├── ihm/
│   ├── dashboard.py          # Interface gráfica (Streamlit/NiceGUI)
│   ├── mqtt_client.py        # Subscriber MQTT com fila de dados
│   ├── processor.py          # Lógica de diagnóstico e alertas
│   ├── datalogger.py         # Gravação CSV e geração de PDF
│   └── ponte_serial_mqtt.py  # Bridge Serial→MQTT para demo Proteus
├── docs/
│   ├── projeto_transformador.tex  # Documentação técnica LaTeX
│   └── projeto_transformador.pdf  # PDF compilado
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
```

Esse é literalmente o payload que será publicado no broker no hardware físico. Toda a estrutura — hierarquia de tópicos, formato JSON, timestamp — está validada já na simulação.

### Ponte Serial→MQTT para demonstrações

Para apresentar o sistema completo durante a entrega da simulação (18/05), o script `ihm/ponte_serial_mqtt.py` lê a porta COM virtual do Proteus, extrai os payloads das linhas `[MQTT]` e republica no broker Mosquitto local. Isso permite demonstrar **simulação → broker MQTT → IHM Python** funcionando ponta a ponta, mesmo sem WiFi.

---

## Mapeamento de Pinos: Simulação → Hardware Físico

| Função | Arduino UNO (Proteus) | ESP32 (físico) | Observação |
|---|---|---|---|
| SCT-013 Primário | A0 | GPIO34 | Input-only no ESP32, sem pull-up interno |
| SCT-013 Secundário | A1 | GPIO35 | Input-only, ideal para ADC |
| DS18B20 (OneWire) | D4 | GPIO4 | Mesmo número por conveniência |
| MPU6050 SDA | A4 | GPIO21 | Wire.h funciona igual nos dois |
| MPU6050 SCL | A5 | GPIO22 | Wire.h funciona igual nos dois |
| Serial TX | D1/TXD | GPIO1 | Virtual Terminal no Proteus |

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
| `transformador/vibracao/fft_120hz` | Amplitude em 120Hz | g |
| `transformador/vibracao/fft_240hz` | Amplitude em 240Hz | g |
| `transformador/status/alarme` | JSON estruturado | — |
| `transformador/status/heartbeat` | Timestamp Unix | s |

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
  "severidade": "warning",
  "valor": 0.42,
  "limite": 0.20,
  "mensagem": "Vibracao em 120Hz acima do limite"
}
```

---

## Como Rodar — Simulação no Proteus

### Pré-requisitos

- Proteus 8.x com biblioteca MPU6050 da [ElectronicTree](https://electronicstree.com/new-mpu6050-proteus-library/) instalada
- PlatformIO (VSCode) com as bibliotecas abaixo instaladas:

```ini
; platformio.ini
[env:uno]
platform = atmelavr
board = uno
framework = arduino
lib_deps =
    paulstoffregen/OneWire @ ^2.3.8
    milesburton/DallasTemperature @ ^3.11.0
    kosme/arduinoFFT @ ^2.0.1
```

### Passo a passo

1. Abra o projeto no VSCode com PlatformIO
2. Compile: `PlatformIO: Build` (atalho `Ctrl+Alt+B`)
3. Localize o `.hex` gerado em `.pio/build/uno/firmware.hex`
4. Copie o `.hex` para a pasta `proteus/`
5. Abra `proteus/MicroProject_3.0.pdsprj`
6. Clique duplo no Arduino UNO → campo **Program File** → selecione o `.hex`
7. Dê **Play** na simulação
8. Clique duplo no **Virtual Terminal** para ver o Serial Monitor
9. Ajuste **Roll / Pitch / Yaw** no MPU6050 para simular movimento

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

Adicionar o ambiente ESP32 ao `platformio.ini`:

```ini
[env:esp32]
platform = espressif32
board = esp32dev
framework = arduino
lib_deps =
    paulstoffregen/OneWire @ ^2.3.8
    milesburton/DallasTemperature @ ^3.11.0
    knolleary/PubSubClient @ ^2.8
    bblanchon/ArduinoJson @ ^7.0.0
    kosme/arduinoFFT @ ^2.0.1
```

No rodapé do VSCode, alterne entre `env:uno` (simulação) e `env:esp32` (físico). **Nenhuma alteração manual no código é necessária** — o `config.h` detecta a plataforma automaticamente.

Antes de gravar no ESP32, ajustar as credenciais WiFi e o IP do broker em `publicador.cpp`:

```cpp
constexpr const char* WIFI_SSID   = "SUA_REDE";
constexpr const char* WIFI_PASS   = "SUA_SENHA";
constexpr const char* MQTT_BROKER = "192.168.1.100";
```

### Broker Mosquitto

```bash
# Ubuntu/Debian
sudo apt install mosquitto mosquitto-clients
echo "listener 1883\nallow_anonymous true" | sudo tee /etc/mosquitto/conf.d/local.conf
sudo systemctl restart mosquitto

# Verificar recebimento dos dados do ESP32
mosquitto_sub -h localhost -t "transformador/#" -v
```

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
| P5 — IHM Python | Dashboard, subscriber MQTT, alertas LED virtuais | Painel funcionando com dados reais do broker |
| P6 — Diagnóstico & Docs | Lógica fuzzy/limites, datalogger CSV, relatório PDF | Diagnósticos na IHM, CSV gravando, PDF exportável |

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
