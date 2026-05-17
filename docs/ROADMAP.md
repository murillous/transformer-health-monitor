# 🗺️ Roadmap e Checklist do Projeto

Status atual de cada módulo do projeto. Marque `[x]` quando completar uma tarefa e atualize a porcentagem do módulo.

> **Convenção:** marque um item como `[x]` quando ele estiver **validado** — não apenas escrito. Se está escrito mas não foi testado, deixa `[ ]` ainda.

---

## Resumo Executivo

| Módulo | Progresso | Responsável |
|---|---|---|
| 🔧 Hardware | ▓▓▓▓▓▓░░░░ 60% | P1 |
| 💾 Firmware Base | ▓▓▓▓▓▓▓▓▓░ 85% | P2 |
| 📊 DSP & Algoritmos | ▓▓░░░░░░░░ 20% | P3 |
| 📡 IoT & MQTT | ▓▓▓░░░░░░░ 30% | P4 |
| 🖥️ IHM Python | ░░░░░░░░░░ 0% | P5 |
| 📋 Diagnóstico & Docs | ▓▓▓▓▓░░░░░ 50% | P6 |

---

## 🔧 Hardware (P1)

### Simulação Proteus

- [x] Adicionar Arduino UNO R3 ao esquemático
- [x] Adicionar MPU6050 com biblioteca ElectronicTree
- [x] Conectar MPU6050 via I²C (SDA→A4, SCL→A5, AD0→GND)
- [x] Adicionar DS18B20 com pull-up 4.7kΩ
- [x] Conectar DS18B20 ao pino D4
- [x] Ajustar propriedades do modelo DS18B20 no Proteus (ver `05-pegadinhas-proteus.md`)
- [x] Montar simulação SCT-013 primário (VSINE 60Hz 1V + R 100Ω + C 10µF + divisor)
- [x] Montar simulação SCT-013 secundário (VSINE 60Hz 0,5V + R 100Ω + C 10µF + divisor)
- [x] Conectar nós centrais aos pinos A0 e A1
- [x] Adicionar Virtual Terminal no pino TX (D1/TXD)
- [x] Adicionar transformador TR1 ilustrativo (não conectado ao Arduino)
- [x] Validar leituras dos 4 sensores no Virtual Terminal
- [ ] Documentar fotos do esquemático final na pasta `proteus/`

### Hardware físico (entrega 15/06)

- [ ] Adquirir componentes (ESP32, sensores, resistores, capacitores)
- [ ] Montar circuito de condicionamento do SCT-013 primário em protoboard
- [ ] Montar circuito de condicionamento do SCT-013 secundário em protoboard
- [ ] Calibrar burden resistor para faixa de corrente esperada
- [ ] Conectar DS18B20 blindado com fita kapton no transformador
- [ ] Fixar MPU6050 rigidamente no chassi (parafuso)
- [ ] Medir sinal condicionado no osciloscópio (~1,65V centro, oscilação esperada)
- [ ] Validar pinagem ESP32 antes de energizar
- [ ] Soldar burden permanentemente nos terminais do SCT-013

---

## 💾 Firmware Base (P2)

### Estrutura modular

- [x] Configurar `platformio.ini` para Arduino UNO
- [x] Criar `config.h` com pinos e calibração
- [x] Implementar detecção de plataforma (`#if defined(ESP32)`)
- [x] Criar módulo `mpu6050` (header + implementação)
- [x] Criar módulo `ds18b20` (header + implementação)
- [x] Criar módulo `sct013` (header + implementação)
- [x] Criar módulo `publicador` (camada de transporte)
- [x] Refatorar `main.cpp` para usar os módulos

### Aquisição de sensores

- [x] Inicialização MPU6050 com verificação de WHO_AM_I
- [x] Leitura de aceleração nos 3 eixos
- [x] Leitura de giroscópio nos 3 eixos
- [x] Conversão de LSB para unidades físicas (g, °/s)
- [x] Inicialização do DS18B20 via OneWire
- [x] Leitura de temperatura com tolerância a falhas (cache)
- [x] Leitura RMS dos SCT-013 (A0 e A1)
- [x] Loop principal não-bloqueante com `millis()`
- [x] Substituir `delay()` do DS18B20 por solução não-bloqueante (resolvido ajustando propriedades do modelo no Proteus — sem necessidade de máquina de estados)
- [x] Validar precisão do cálculo RMS (~0.707V no primário)

### Portabilidade ESP32

- [x] Adicionar `env:esp32` no `platformio.ini`
- [ ] Testar compilação para ESP32 (sem gravar ainda)
- [ ] Configurar credenciais WiFi em `publicador.cpp`
- [ ] Gravar firmware no ESP32 físico
- [ ] Validar leituras dos 4 sensores no hardware real

---

## 📊 DSP & Algoritmos (P3)

### FFT — análise vibracional

- [ ] Adicionar biblioteca `kosme/arduinoFFT` ao `platformio.ini`
- [ ] Coletar buffer de amostras do MPU6050 (eixo Z, ~500Hz)
- [ ] Aplicar janelamento (Hamming)
- [ ] Calcular FFT do buffer
- [ ] Extrair amplitude na frequência de 120Hz
- [ ] Extrair amplitude na frequência de 240Hz (2ª harmônica)
- [ ] Publicar nos tópicos `vibracao/fft_120hz` e `vibracao/fft_240hz`
- [ ] Validar com sinal sintético conhecido (gerar 120Hz puro, verificar pico)

### Detecção de Inrush Current

- [ ] Implementar buffer circular de corrente do primário
- [ ] Definir limiar de corrente para considerar inrush
- [ ] Implementar máquina de estados (idle → monitorando → cooldown)
- [ ] Capturar pico máximo durante janela de 500ms
- [ ] Publicar flag + valor no tópico `primario/inrush` (QoS 1, retained)
- [ ] Testar com simulação de surto na VSINE

### Gradiente térmico (ΔT)

- [ ] Estimar temperatura ambiente (constante ou sensor externo)
- [ ] Calcular ΔT = T_núcleo − T_ambiente
- [ ] Cruzar ΔT com nível de carga (corrente secundária)
- [ ] Publicar no tópico `nucleo/delta_t`
- [ ] Implementar alerta de eficiência (ΔT crescente sem aumento de carga)

---

## 📡 IoT & MQTT (P4)

### Camada de abstração

- [x] Criar interface `publicador::publicar()`
- [x] Implementar saída Serial para Proteus (formato `[MQTT] tópico -> JSON`)
- [x] Definir formato JSON do payload (`ts`, `valor`, `unidade`)
- [x] Definir constantes de tópicos em `config.h`
- [ ] Implementar publicação MQTT real via PubSubClient (ramo `#if defined(ESP32)`)
- [ ] Implementar reconexão automática quando WiFi/broker cair
- [ ] Implementar `publicar_alarme()` com payload estruturado (severidade, mensagem)

### Broker e infraestrutura

- [ ] Instalar Mosquitto na máquina da equipe
- [ ] Configurar `listener 1883` + `allow_anonymous true` para rede local
- [ ] Documentar IP fixo da máquina do broker
- [ ] Criar script de teste com `mosquitto_pub`/`mosquitto_sub`

### Ponte Serial→MQTT (para demonstração no Proteus)

- [ ] Configurar componente COMPIM no Proteus
- [ ] Criar par de portas COM virtuais (com0com no Windows / socat no Linux)
- [ ] Escrever `ihm/ponte_serial_mqtt.py` com regex para extrair payloads
- [ ] Validar pipeline: Proteus → ponte → broker → MQTT Explorer

---

## 🖥️ IHM Python (P5)

### Setup inicial

- [ ] Criar pasta `ihm/` com estrutura modular
- [ ] Configurar `requirements.txt` (paho-mqtt, streamlit/nicegui, plotly, etc.)
- [ ] Escolher framework definitivo (Streamlit vs NiceGUI)
- [ ] Criar venv e documentar setup no `01-setup.md`

### Subscriber MQTT

- [ ] Implementar `mqtt_client.py` com `paho-mqtt`
- [ ] Subscrever em `transformador/#`
- [ ] Decodificar payloads JSON
- [ ] Encaminhar dados para fila thread-safe (`queue.Queue`)
- [ ] Tratar reconexão automática

### Dashboard

- [ ] Layout do painel (4 cards principais: temp, corrente P, corrente S, vibração)
- [ ] Gráfico de linha em tempo real para cada grandeza (últimos 60s)
- [ ] Gráfico de barras do espectro FFT (10 primeiras harmônicas)
- [ ] LEDs virtuais (verde/amarelo/vermelho) por categoria de falha
- [ ] Pop-up de notificação para alarmes críticos
- [ ] Botão "Iniciar/Parar aquisição"
- [ ] Botão "Reset de alarmes" (acknowledge)

---

## 📋 Diagnóstico & Docs (P6)

### Lógica de diagnóstico

- [ ] Implementar `processor.py` com limites de controle
- [ ] Definir limiares de aviso/crítico para temperatura
- [ ] Definir limiares para amplitude em 120Hz
- [ ] Definir limiar para gradiente térmico
- [ ] Lógica de correlação multi-variável (ΔT + queda de eficiência → curto entre espiras)
- [ ] Mensagens de sugestão de intervenção técnica
- [ ] Histórico de eventos com timestamp

### Datalogger

- [ ] Implementar `datalogger.py` com gravação CSV
- [ ] Cabeçalho com timestamps ISO 8601
- [ ] Rotação de arquivos por dia
- [ ] Flush periódico (não perder dados em queda de energia)

### Relatório PDF

- [ ] Escolher biblioteca (ReportLab ou WeasyPrint)
- [ ] Template com cabeçalho/rodapé profissional
- [ ] Gráficos consolidados do período
- [ ] Tabela de eventos críticos
- [ ] Sugestões de intervenção
- [ ] Exportação sob demanda via botão na IHM

### Documentação

- [x] README do projeto
- [x] Documento LaTeX técnico (`projeto_transformador.tex`)
- [x] Setup do ambiente (`01-setup.md`)
- [x] Arquitetura do firmware (`02-arquitetura.md`)
- [x] Guia MQTT (`03-mqtt.md`)
- [x] Padrões de código (`04-padroes-codigo.md`)
- [x] Pegadinhas do Proteus (`05-pegadinhas-proteus.md`)
- [x] Roadmap/checklist (este documento)
- [ ] Guia IHM Python (criar quando IHM começar a tomar forma)
- [ ] Slides da apresentação 18/05
- [ ] Slides da apresentação 15/06

---

## 🎯 Milestones

### 📅 18/05/2026 — 2ª Avaliação (Simulação)

**Critérios mínimos:**
- [x] Simulação Proteus funcionando com 4 sensores
- [x] Firmware modular compilando sem warnings
- [x] Leituras estáveis no Virtual Terminal
- [x] Firmware totalmente não-bloqueante (zero `delay()`)
- [ ] Pipeline `[MQTT]` Serial → broker funcionando (ponte Python)
- [ ] IHM mínima recebendo dados do broker (mesmo que parcial)
- [ ] Pelo menos um diagnóstico funcionando (ex.: alerta de temperatura)
- [ ] Apresentação da equipe preparada (slides + demo ao vivo)

### 📅 15/06/2026 — 3ª Avaliação (Hardware físico)

**Critérios mínimos:**
- [ ] ESP32 funcionando com 4 sensores reais
- [ ] WiFi conectando e publicando no broker
- [ ] IHM completa com dashboard, alertas, datalogger e PDF
- [ ] FFT funcional analisando vibração em 120Hz
- [ ] Detecção de Inrush demonstrada
- [ ] Relatório PDF exportável
- [ ] Defesa final do projeto

---

## Como atualizar este documento

Toda vez que completar uma tarefa:

1. Edite este arquivo trocando `[ ]` por `[x]` na tarefa concluída
2. Atualize a porcentagem do módulo no Resumo Executivo
3. Commit com mensagem `docs: atualiza roadmap — <o que foi feito>`
4. Push pra branch atual

Em reuniões de equipe, abram este documento na tela compartilhada — é o "termômetro" do projeto.