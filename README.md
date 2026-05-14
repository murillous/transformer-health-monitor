# 🔌 Diagnóstico de Saúde de Transformadores

> Projeto Integrador — Microcontroladores  
> Tema 2: Manutenção Preditiva e Diagnóstico Operacional via IoT  
> Engenharia da Computação · UEMA · São Luís, MA · 2026

---

## Visão Geral

Sistema embarcado de monitoramento contínuo para transformadores elétricos, capaz de detectar falhas em desenvolvimento antes que se tornem críticas. O sistema coleta grandezas elétricas, térmicas e mecânicas em tempo real, transmite os dados via MQTT e exibe diagnósticos automáticos em um painel supervisório Python.

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

```
diagnostico_transformador/
├── src/
│   └── main.cpp              # Firmware principal (Arduino/ESP32)
├── include/                  # Headers locais
├── lib/                      # Bibliotecas locais
├── proteus/
│   ├── diagnostico.pdsprj    # Projeto de simulação Proteus
│   └── diagnostico.hex       # Binário gerado para simulação
├── ihm/
│   ├── dashboard.py          # Interface gráfica (Streamlit/NiceGUI)
│   ├── mqtt_client.py        # Subscriber MQTT com fila de dados
│   ├── processor.py          # Lógica de diagnóstico e alertas
│   └── datalogger.py         # Gravação CSV e geração de PDF
├── docs/
│   ├── projeto_transformador.tex  # Documentação técnica LaTeX
│   └── projeto_transformador.pdf  # PDF compilado
├── platformio.ini
└── README.md
```

---

## Hardware

### Componentes Reais (ESP32 — entrega 15/06)

| Componente | Função | Pino ESP32 |
|---|---|---|
| SCT-013-030 | Corrente primário (220V) — clamp não invasivo | GPIO34 (ADC) |
| SCT-013-030 | Corrente secundário (12V) — clamp não invasivo | GPIO35 (ADC) |
| DS18B20 blindado | Temperatura do núcleo | GPIO4 (OneWire) |
| MPU6050 | Vibração mecânica do chassi | GPIO21/22 (I2C) |

### Componentes de Simulação (Arduino UNO — Proteus — entrega 18/05)

| Componente real | Substituto no Proteus | Motivo |
|---|---|---|
| SCT-013 | VSINE 60Hz + R 100Ω + C 10µF + divisor 10k+10k | Sensor não existe na biblioteca do Proteus |
| ESP32 | Arduino UNO R3 V3.0 | ESP32 não disponível no Proteus |
| MPU6050 | MPU6050 (biblioteca ElectronicTree) | Biblioteca de terceiro necessária |
| DS18B20 | DS18B20 (biblioteca padrão) | Disponível nativamente |

---

## Como o Transformador é Simulado

O SCT-013 é um transformador de corrente não invasivo que, na prática, produz uma
corrente proporcional à corrente que circula no fio monitorado. Essa corrente é convertida
em tensão por um resistor burden e condicionada para o ADC.

Como o Proteus não possui o SCT-013, o sinal já condicionado que chegaria ao ADC
é reproduzido diretamente por um circuito gerador:

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

A diferença de amplitude entre os canais simula o fato de que o primário (220V)
induz mais corrente no SCT-013 do que o secundário (12V), proporcionalmente
à relação de transformação do equipamento monitorado.

**Por que funciona:** o cálculo RMS no firmware extrai exatamente o que importa
para o diagnóstico — a magnitude eficaz do sinal de corrente. No hardware físico,
o mesmo código lê o sinal real do SCT-013. A única diferença entre simulação e
realidade é a origem do sinal no pino analógico.

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

---

## Tópicos MQTT

| Tópico | Dado | Unidade |
|---|---|---|
| `transformador/primario/corrente` | Corrente RMS primário | A |
| `transformador/primario/inrush` | Flag + valor de pico | A |
| `transformador/secundario/corrente` | Corrente RMS secundário | A |
| `transformador/nucleo/temperatura` | Temperatura absoluta | °C |
| `transformador/nucleo/delta_t` | Gradiente térmico | °C |
| `transformador/vibracao/fft_120hz` | Amplitude em 120Hz | g |
| `transformador/vibracao/fft_240hz` | Amplitude em 240Hz | g |
| `transformador/status/alarme` | JSON estruturado | — |
| `transformador/status/heartbeat` | Timestamp Unix | s |

---

## Como Rodar — Simulação no Proteus

### Pré-requisitos

- Proteus 8.x com biblioteca MPU6050 da [ElectronicTree](https://electronicstree.com/new-mpu6050-proteus-library/) instalada
- PlatformIO (VSCode) com as bibliotecas abaixo instaladas:

```ini
; platformio.ini
lib_deps =
    milesburton/DallasTemperature @ ^3.11.0
    paulstoffregen/OneWire @ ^2.3.8
    bblanchon/ArduinoJson @ ^7.0.0
    kosme/arduinoFFT @ ^2.0.1
```

### Passo a passo

1. Abra o projeto no VSCode com PlatformIO
2. Compile: `PlatformIO: Build` (atalho `Ctrl+Alt+B`)
3. Localize o `.hex` gerado em `.pio/build/uno/firmware.hex`
4. Copie o `.hex` para a pasta `proteus/`
5. Abra `proteus/diagnostico.pdsprj`
6. Clique duplo no Arduino UNO → campo **Program File** → selecione o `.hex`
7. Dê **Play** na simulação
8. Clique duplo no **Virtual Terminal** para ver o Serial Monitor
9. Ajuste **Roll / Pitch / Yaw** no MPU6050 para simular movimento

### Saída esperada no Virtual Terminal

```
===================================
   DIAGNOSTICO - PROTEUS
===================================
[MPU6050] WHO_AM_I: 0x68 --> OK
[DS18B20] Sensores: 1
[DS18B20] Temp. inicial: 27.0 C
[SCT-013] A0=primario  A1=secundario -- OK
-----------------------------------
Acel (g)   X:-1.00  Y:0.00  Z:0.00
Giro (g/s) X:0.0    Y:0.0   Z:0.0
Temp (C):  27.0
SCT Prim (Vrms): 0.6914
SCT Sec  (Vrms): 0.3461
-----------------------------------
```

> **Nota:** O eixo X do acelerômetro aparece como -1.00 com Roll=0 — limitação
> conhecida do modelo `.dll` da biblioteca ElectronicTree. Não impacta o diagnóstico,
> pois a FFT analisa variações do sinal, não o valor absoluto em repouso.

---

## Como Rodar — Hardware Físico (ESP32)

Antes de compilar para o ESP32, aplicar as seguintes alterações em `src/main.cpp`:

```cpp
// Trocar:
#define VREF          5.0
#define ADC_RESOLUCAO 1023.0

// Por:
#define VREF          3.3
#define ADC_RESOLUCAO 4095.0
```

Remover o `delay(100)` dentro de `lerTemperatura()` e substituir por leitura
assíncrona com `millis()`.

Instalar e iniciar o broker Mosquitto:

```bash
# Ubuntu/Debian
sudo apt install mosquitto mosquitto-clients
echo "listener 1883\nallow_anonymous true" | sudo tee /etc/mosquitto/conf.d/local.conf
sudo systemctl restart mosquitto

# Testar publicação
mosquitto_pub -h localhost -t "transformador/nucleo/temperatura" \
  -m '{"ts":1000,"valor":45.2,"unidade":"C"}'
```

---

## Limitações Conhecidas da Simulação

| Limitação | Impacto | Solução no hardware físico |
|---|---|---|
| Eixo X do MPU6050 travado em -1.00 | Nenhum — FFT usa variação, não valor absoluto | Sensor real funciona corretamente |
| DS18B20 requer `delay(100)` explícito | Viola princípio não-bloqueante | Removido no firmware do ESP32 |
| SCT-013 substituído por VSINE | Sinal sintético, sem ruído real | Sensor real com circuito de condicionamento |
| Sem comunicação MQTT no Proteus | IHM Python não recebe dados da simulação | ESP32 com WiFi resolve nativamente |

---

## Divisão de Tarefas

| Pessoa | Responsabilidade | Entrega verificável |
|---|---|---|
| P1 — Hardware | Circuito físico, condicionamento SCT-013, pinagem ESP32 | Sinal condicionado mensurável no osciloscópio |
| P2 — Firmware Base | Código não-bloqueante, DS18B20, SCT-013, MPU6050 | Leituras estáveis no Serial Monitor sem `delay()` |
| P3 — DSP & Algoritmos | FFT 120Hz, detecção Inrush, gradiente ΔT | Espectro vibracional e flag de Inrush funcionando |
| P4 — IoT & MQTT | Broker Mosquitto, PubSubClient, JSON com timestamp | ESP32 publicando nos tópicos, testável com `mosquitto_sub` |
| P5 — IHM Python | Dashboard, gráficos em tempo real, alertas LED virtuais | Painel funcionando com dados reais do broker |
| P6 — Diagnóstico & Docs | Lógica fuzzy/limites, datalogger CSV, relatório PDF | Diagnósticos na IHM, CSV gravando, PDF exportável |

---

## Cronograma

| Data | Avaliação | Status |
|---|---|---|
| 18/05/2025 | 2ª Avaliação — Simulação Proteus | 🔄 Em andamento |
| 15/06/2025 | 3ª Avaliação — Protótipo físico + IHM integrada | ⏳ Pendente |

---

## Referências

- IEEE Std C57.91-2011 — *Guide for Loading Mineral-Oil-Immersed Transformers*
- ABNT NBR 5356-1:2007 — *Transformadores de potência*
- Espressif — [ESP32 Technical Reference Manual](https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf)
- ElectronicTree — [MPU6050 Proteus Library](https://electronicstree.com/new-mpu6050-proteus-library/)
- OpenEnergyMonitor — [CT Sensors: Interfacing with Arduino](https://learn.openenergymonitor.org/electricity-monitoring/ct-sensors/)