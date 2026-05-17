# 🗺️ Roadmap e Checklist do Projeto

Status atual de cada módulo do projeto. Marque `[x]` quando completar uma tarefa e atualize a porcentagem do módulo.

> **Convenção:** marque um item como `[x]` quando ele estiver **validado** — não apenas escrito. Se está escrito mas não foi testado, deixa `[ ]` ainda.

---

## Resumo Executivo

| Módulo | Progresso | Responsável |
|---|---|---|
| 🔧 Hardware | ▓▓▓▓▓▓░░░░ 60% | P1 |
| 💾 Firmware Base | ▓▓▓▓▓▓▓▓▓░ 95% | P2 |
| 📊 DSP & Algoritmos | ▓▓▓▓▓▓▓▓░░ 80% | P3 |
| 📡 IoT & MQTT | ▓▓▓▓▓▓▓▓▓░ 90% | P4 |
| 🖥️ Supervision (Frontend) | ▓▓▓▓▓▓▓▓▓░ 90% | P5 |
| 📋 Supervision (Backend + Diagnóstico) | ▓▓▓▓▓▓▓▓░░ 85% | P6 |

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
- [x] Adicionar COMPIM ligando TXD do Arduino ao TXD do COMPIM (ver `05-pegadinhas-proteus.md` item 12)
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

- [x] Configurar `platformio.ini` para Arduino UNO e ESP32
- [x] Criar `config.h` com pinos, calibração e tópicos
- [x] Implementar detecção de plataforma (`#if defined(ESP32)`)
- [x] Criar módulo `mpu6050` (header + implementação)
- [x] Criar módulo `ds18b20` (header + implementação)
- [x] Criar módulo `sct013` (header + implementação)
- [x] Criar módulo `publicador` (camada de transporte)
- [x] Criar módulo `analise_vibracao` (buffer MPU6050 + FFT + exposição de magnitudes)
- [x] Criar módulo `diagnostico` (ΔT, inrush e alarmes)
- [x] Refatorar `main.cpp` para usar os módulos
- [x] Publicar heartbeat (`transformador/status/heartbeat`) a cada ciclo

### Aquisição de sensores

- [x] Inicialização MPU6050 com verificação de WHO_AM_I
- [x] Leitura de aceleração nos 3 eixos
- [x] Leitura de giroscópio nos 3 eixos
- [x] Conversão de LSB para unidades físicas (g, °/s)
- [x] Inicialização do DS18B20 via OneWire
- [x] Leitura de temperatura com tolerância a falhas (cache)
- [x] Leitura RMS dos SCT-013 (A0 e A1)
- [x] Loop principal não-bloqueante com `millis()`
- [x] Substituir `delay()` do DS18B20 por solução não-bloqueante (resolvido ajustando propriedades do modelo no Proteus)
- [x] Validar precisão do cálculo RMS (~0.707V no primário)

### Portabilidade ESP32

- [x] Adicionar `env:esp32` no `platformio.ini`
- [x] Testar compilação para ESP32 (sem gravar ainda)
- [x] Implementar publicação MQTT real via PubSubClient
- [x] Definir `mqtt.setBufferSize(1024)` para acomodar payload de espectro
- [ ] Configurar credenciais WiFi finais em `publicador.cpp` (após decidir rede do laboratório)
- [ ] Implementar reconexão automática de WiFi (atualmente só MQTT reconecta)
- [ ] Gravar firmware no ESP32 físico
- [ ] Validar leituras dos 4 sensores no hardware real

---

## 📊 DSP & Algoritmos (P3)

### FFT — análise vibracional

- [x] Adicionar biblioteca `kosme/arduinoFFT` ao `platformio.ini`
- [x] Coletar buffer de amostras do MPU6050 (eixo Z, ~500Hz)
- [x] Aplicar janelamento (Hamming)
- [x] Calcular FFT do buffer
- [x] Extrair amplitude na frequência de 120Hz
- [x] Extrair amplitude na frequência de 240Hz (2ª harmônica)
- [x] Publicar nos tópicos `vibracao/fft_120hz` e `vibracao/fft_240hz`
- [x] Expor vetor de magnitudes via `analise_vibracao::magnitudes()`
- [x] Publicar espectro completo (15 bins) em `transformador/vibracao/espectro`
- [ ] Validar com sinal sintético conhecido (gerar 120Hz puro, verificar pico)
- [ ] Avaliar aumento de N_AMOSTRAS no ESP32 para melhorar resolução (físico)

### Detecção de Inrush Current

- [ ] Implementar buffer circular de corrente do primário
- [x] Definir limiar de corrente para considerar inrush
- [x] Implementar máquina de estados (idle → monitorando → cooldown)
- [x] Capturar pico máximo durante janela de 500ms
- [x] Publicar flag + valor no tópico `primario/inrush`
- [ ] Testar com simulação de surto na VSINE

### Gradiente térmico (ΔT)

- [x] Estimar temperatura ambiente (constante ou sensor externo)
- [x] Calcular ΔT = T_núcleo − T_ambiente
- [ ] Cruzar ΔT com nível de carga (corrente secundária)
- [x] Publicar no tópico `nucleo/delta_t`
- [ ] Implementar alerta de eficiência (ΔT crescente sem aumento de carga)

---

## 📡 IoT & MQTT (P4)

### Camada de abstração

- [x] Criar interface `publicador::publicar()`
- [x] Implementar saída Serial para Proteus (formato `[MQTT] tópico -> JSON`)
- [x] Definir formato JSON do payload (`ts`, `valor`, `unidade`)
- [x] Definir constantes de tópicos em `config.h`
- [x] Implementar publicação MQTT real via PubSubClient (ramo `#if defined(ESP32)`)
- [x] Implementar `publicarAlarme()` com payload estruturado (severidade, mensagem)
- [x] Implementar `publicarEspectro()` (stream Serial no UNO, buffer único no ESP32)
- [x] Aumentar `MQTT_MAX_PACKET_SIZE` no ESP32 (`mqtt.setBufferSize(1024)`)
- [ ] Implementar reconexão automática de WiFi quando cair

### Broker e infraestrutura

- [x] Instalar Mosquitto na máquina da equipe
- [x] Configurar `listener 1883` + `allow_anonymous true` para rede local
- [x] Documentar IP fixo da máquina do broker
- [x] Criar script de teste com `mosquitto_pub`/`mosquitto_sub`

### Ponte Serial→MQTT (para demonstração no Proteus)

- [x] Configurar componente COMPIM no Proteus (TXD→TXD)
- [x] Criar par de portas COM virtuais (com0com no Windows / socat no Linux)
- [x] Escrever `tools/serial_bridge/bridge.py` com regex para extrair payloads e reescrita de `ts`
- [x] Validar pipeline: Proteus → ponte → broker → MQTT Explorer
- [x] Validar pipeline: Proteus → ponte → broker → server supervision → dashboard

---

## 🖥️ Supervision — Frontend (P5)

> Stack TS substituiu o plano original de IHM Python (Streamlit/NiceGUI).

### Setup inicial

- [x] Criar monorepo `supervision/` com workspaces npm
- [x] Configurar `apps/web` (Vite + React 19 + Tailwind + shadcn/ui)
- [x] Configurar `apps/server` (Express + ws + TypeScript)
- [x] Configurar `packages/shared` (tipos Zod + constantes de tópicos e limites)

### WebSocket + estado global

- [x] `useWebSocket` com reconexão automática
- [x] `useDashboard` consumindo o WS, EMA para espectro, dedup de alarmes
- [x] `useTheme` com persistência em localStorage

### Páginas e componentes

- [x] Página `Dashboard` com tabs
- [x] Página `Alertas` paginada com filtros (sev/período)
- [x] Página `Relatorio` para gerar PDF
- [x] Card `MetricCard` com `border-l-4` colorido por severidade
- [x] Gráficos de linha (`Chart`)
- [x] Gráfico de espectro (`SpectrumChart` — domínio 0-250Hz após ajuste para os bins reais do FFT)
- [x] Gráficos de onda (`WaveformChart`) — esperam dados `onda_corrente_*` que o firmware atual não publica (mantidos para hardware físico futuro)
- [x] `DiagnosticoPanel` + `DiagnosticoResumo`
- [x] `AlertasResumo`
- [x] Notificações toast via sonner

### Pendências

- [ ] Decidir como exibir `vibracao/aceleracao` e `primario/inrush` (firmware publica, frontend não tem card dedicado)
- [ ] Polish responsivo para resolução de projetor
- [ ] Testes E2E mínimos

---

## 📋 Supervision — Backend + Diagnóstico (P6)

### Server Express

- [x] Express com WebSocket Hub
- [x] Rota REST `/api/historico` e `/api/historico/alarmes`
- [x] Rota REST `/api/diagnostico` (chama o motor fuzzy)
- [x] Rota REST `/api/relatorio` (PDF via Puppeteer)
- [x] Simulador embutido (`/api/simular/iniciar`) — útil quando broker não está disponível

### MQTT subscriber

- [x] Conectar ao broker, subscrever em `TOPICOS_INSCREVER`
- [x] Persistir leituras (SQLite + CSV)
- [x] Handler especial para `transformador/status/alarme` (traduz `severidade` → `sev`)
- [x] Handler especial para `transformador/vibracao/espectro` (broadcast direto)
- [x] Script `dev:server:offline` para rodar sem broker
- [ ] Mecanismo de reconexão automática ao broker quando cair

### Motor fuzzy (Python)

- [x] 17+ regras Mamdani cobrindo falhas térmicas, mecânicas, elétricas e harmônicas
- [x] Defuzzificação por centróide
- [x] Subprocess chamado pelo server a cada ciclo
- [x] Correlação CV (corrente × vibração)
- [x] Vida residual via Arrhenius
- [x] Tendência preditiva (regressão linear)

### Persistência

- [x] SQLite WAL com índices
- [x] CSV append diário (`data/datalog_*.csv` + `alarmes_*.csv`)
- [x] Paginação no histórico de alarmes

### Relatório PDF

- [x] Cabeçalho com status geral
- [x] Tabela de estatísticas
- [x] SVGs inline para gráficos
- [x] Tabela de eventos críticos
- [ ] Recomendações automáticas baseadas no diagnóstico fuzzy (apenas textual hoje)

### Documentação

- [x] README do projeto
- [x] Documento LaTeX técnico (`Diagnostico_transformador.tex`)
- [x] Setup do ambiente (`01-setup.md`)
- [x] Arquitetura do firmware (`02-arquitetura.md`)
- [x] Guia MQTT (`03-mqtt.md`)
- [x] Padrões de código (`04-padroes-codigo.md`)
- [x] Pegadinhas do Proteus (`05-pegadinhas-proteus.md`)
- [x] Roadmap/checklist (este documento)
- [x] README da pasta `supervision/`
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
- [x] Pipeline `[MQTT]` Serial → ponte → broker funcionando
- [x] Dashboard recebendo dados do broker em tempo real
- [x] Espectro FFT exibido no dashboard
- [x] Diagnóstico fuzzy ativo, gerando recomendações
- [ ] Apresentação da equipe preparada (slides + demo ao vivo)

### 📅 15/06/2026 — 3ª Avaliação (Hardware físico)

**Critérios mínimos:**
- [ ] ESP32 funcionando com 4 sensores reais
- [ ] WiFi conectando e publicando no broker
- [ ] Reconexão WiFi/MQTT robusta
- [x] IHM completa com dashboard, alertas, datalogger e PDF (já roda com dados sintéticos/Proteus)
- [x] FFT funcional (precisa só calibrar com sinal real)
- [x] Detecção de Inrush implementada (precisa só calibrar com surto real)
- [x] Relatório PDF exportável
- [ ] Defesa final do projeto

---

## Como atualizar este documento

Toda vez que completar uma tarefa:

1. Edite este arquivo trocando `[ ]` por `[x]` na tarefa concluída
2. Atualize a porcentagem do módulo no Resumo Executivo
3. Commit com mensagem `docs: atualiza roadmap — <o que foi feito>`
4. Push pra branch atual

Em reuniões de equipe, abram este documento na tela compartilhada — é o "termômetro" do projeto.
