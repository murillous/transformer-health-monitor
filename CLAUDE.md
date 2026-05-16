# CLAUDE.md

Contexto para Claude Code trabalhar neste projeto. Leia antes de gerar ou modificar código.

---

## O que é este projeto

Sistema embarcado de **monitoramento e diagnóstico preditivo de transformadores elétricos**. Projeto acadêmico do curso de Engenharia da Computação da UEMA (2026).

Coleta 4 grandezas (corrente primária/secundária, temperatura do núcleo, vibração mecânica), processa localmente (FFT, RMS, detecção de inrush) e publica via MQTT para uma IHM Python.

**Duas plataformas-alvo:**
- **Arduino UNO** rodando em simulação Proteus (entrega 18/05/2026)
- **ESP32** em hardware físico (entrega 15/06/2026)

O firmware compila para ambos sem alterações manuais — a detecção é automática via `#if defined(ESP32)`.

---

## Stack

- **Linguagem firmware:** C++ (Arduino framework)
- **Build:** PlatformIO
- **Linguagem IHM:** Python (Streamlit ou NiceGUI — a decidir)
- **Broker:** Mosquitto
- **Bibliotecas firmware:** OneWire, DallasTemperature, PubSubClient (ESP32), arduinoFFT

---

## Estrutura do repositório

```
src/                  ← firmware modular
  main.cpp            ← orquestração — setup() + loop()
  config.h            ← pinos, calibração, tópicos — detecta plataforma
  publicador.h/cpp    ← camada de transporte (Serial OU MQTT)
  mpu6050.h/cpp       ← acelerômetro/giroscópio (I²C)
  ds18b20.h/cpp       ← temperatura (OneWire) com cache de tolerância
  sct013.h/cpp        ← corrente RMS (ADC)
proteus/              ← .pdsprj e .hex da simulação
ihm/                  ← dashboard Python (em desenvolvimento)
docs/                 ← documentação Markdown + LaTeX
platformio.ini
README.md
```

Para detalhes da arquitetura, sempre consulte `docs/02-arquitetura.md` antes de mexer em código.

---

## Convenções não-negociáveis

### 1. Zero `delay()` no `loop()` principal

```cpp
// ❌ Proibido
void loop() {
    lerSensores();
    delay(2000);
}

// ✅ Correto
void loop() {
    if (millis() - ultimaLeitura < INTERVALO_MS) return;
    ultimaLeitura = millis();
    lerSensores();
}
```

**Exceção documentada:** `ds18b20.cpp` tem `delay(200)` interno por causa do modelo do Proteus — está comentado no código e deve ser removido no port pra ESP32.

### 2. Use `constexpr` em vez de `#define` para constantes

```cpp
// ❌ Antigo
#define MPU_ADDR 0x68

// ✅ Moderno C++
constexpr uint8_t MPU_ADDR = 0x68;
```

Motivo: `constexpr` tem tipo, é verificado pelo compilador, evita warnings de ambiguidade de sobrecarga (caso real que aconteceu com `Wire.requestFrom`).

### 3. Strings literais usam `F()` no Arduino UNO

```cpp
Serial.println(F("Iniciando..."));  // fica na flash, não na RAM
```

UNO tem só 2KB de RAM — strings literais sem `F()` desperdiçam memória preciosa.

### 4. Variáveis em escopo de arquivo são `static`

```cpp
// dentro de mpu6050.cpp
static OneWire oneWire(PINO_DS18B20);  // limitado a este arquivo
```

### 5. Cada sensor é um módulo isolado em namespace

```cpp
// mpu6050.h
namespace mpu6050 {
    bool     iniciar();
    Leitura  ler();
}
```

Não use classes para sensores singleton — namespace é mais leve e legível para esse padrão.

---

## A abstração `publicador` é fundamental

Toda saída de dados passa por uma função única:

```cpp
publicador::publicar("transformador/nucleo/temperatura", 26.5, "C");
```

Internamente:
- **Em Arduino UNO** (sem WiFi): imprime no Serial com prefixo `[MQTT]` em formato compatível
- **Em ESP32**: publica de fato no broker MQTT via PubSubClient

A seleção é automática via `#if defined(ESP32)`. **Nunca chame `Serial.print` diretamente para dados de sensor** — sempre use `publicador::publicar()`.

---

## Como adicionar um sensor novo

Veja `docs/02-arquitetura.md` para o passo a passo. Resumo:

1. Criar `src/sensor_novo.h` (namespace com `iniciar()` e `ler()`)
2. Criar `src/sensor_novo.cpp` (implementação)
3. Adicionar pino em `config.h`
4. Adicionar tópico MQTT em `config.h`
5. Incluir e chamar no `main.cpp`

**Não modifique** os outros módulos para integrar o novo sensor — isso é antipadrão.

---

## Comandos comuns

```bash
# Compilar para simulação Proteus
pio run -e uno

# Compilar para ESP32 físico
pio run -e esp32

# Limpar build (útil se travar)
pio run -t clean

# Onde o .hex é gerado (carregar no Proteus)
.pio/build/uno/firmware.hex

# Gravar no ESP32 físico (USB conectado)
pio run -e esp32 -t upload

# Monitor serial pós-upload
pio device monitor -b 9600
```

---

## Gotchas conhecidos

### `snprintf` com `%f` não funciona no AVR

A libc do AVR remove suporte a float em `printf` para economizar memória. Use `dtostrf()`:

```cpp
char buf[16];
dtostrf(valor, 0, 4, buf);  // largura mínima 0, 4 casas decimais
snprintf(payload, sizeof(payload), "\"valor\":%s", buf);
```

### `Wire.requestFrom()` gera warning de ambiguidade no AVR

Tem duas sobrecargas `(int, int)` e `(uint8_t, uint8_t)`. Use `constexpr uint8_t` para o endereço (não `#define`) e o compilador resolve.

### DS18B20 no Proteus tem leituras intermitentes

O módulo `ds18b20.cpp` já implementa cache da última leitura válida (`ultimaTempValida`). Se uma leitura vier inválida (NaN, -127, ou 85), retorna a última boa. Esse comportamento é **intencional** — não tente "consertar" removendo o cache.

### MPU6050 no Proteus trava eixo X em -1.00g

Limitação do modelo `.dll` da biblioteca ElectronicTree. Não tem como corrigir, e não impacta o diagnóstico real (a FFT analisa variação, não valor absoluto).

### Sem WiFi no Proteus → MQTT não funciona diretamente na simulação

Não tente fazer o Arduino UNO falar MQTT — não vai funcionar. A estratégia é:
- Arduino imprime no Serial em formato `[MQTT] tópico -> JSON`
- Script Python `ihm/ponte_serial_mqtt.py` lê o Serial e republica no broker real
- Esse fluxo está documentado em `docs/03-mqtt.md`

### Não use `String` (classe do Arduino) em loops

Causa fragmentação de heap. Use `char[]` com `snprintf` ou `strncpy`.

---

## Quando criar arquivos novos vs modificar existentes

- **Sensor novo:** crie módulo próprio (`.h` + `.cpp`)
- **Lógica de diagnóstico:** crie módulo `diagnostico.h/cpp` (não existe ainda — P3/P6)
- **Comunicação alternativa:** modifique `publicador.cpp` (não crie módulo paralelo)
- **Configuração nova:** adicione em `config.h`, nunca espalhe `constexpr` pelos módulos

---

## Estilo de commits

Padrão Conventional Commits:

```
feat: adiciona detecção de inrush no SCT-013 primário
fix: corrige cache de temperatura quando primeira leitura é inválida
refactor: extrai publicador para módulo separado
docs: atualiza README com estrutura modular
chore: adiciona PubSubClient às dependências
```

Imperativo, descrição curta, sem ponto final. Corpo opcional explicando o porquê (não o quê).

---

## Onde olhar quando travar

| Problema | Documento |
|---|---|
| Como configurar ambiente do zero | `docs/01-setup.md` |
| Como o firmware é organizado | `docs/02-arquitetura.md` |
| Como funciona o MQTT do projeto | `docs/03-mqtt.md` |
| Convenções de código completas | `docs/04-padroes-codigo.md` |
| Status atual e o que falta | `docs/ROADMAP.md` |
| Contexto técnico profundo | `docs/projeto_transformador.pdf` |

---

## Comportamento esperado do Claude Code neste projeto

- **Antes de mexer em código:** ler o módulo todo, não só a função visível
- **Antes de criar abstração nova:** verificar se já existe uma similar (`publicador` é o caso clássico)
- **Antes de adicionar dependência:** ver se cabe na flash do AVR (32KB)
- **Antes de propor mudança grande:** consultar o `ROADMAP.md` para entender o que está em andamento
- **Ao gerar código novo:** seguir as convenções de `docs/04-padroes-codigo.md` sem desvio
- **Ao escrever comentários:** explicar o *porquê*, não o *quê* — código limpo já mostra o quê
- **Ao encontrar `delay()`:** questionar se é justificado (só ok em `setup()` ou com comentário explicando)

Se algo não estiver claro nos docs, **pergunte antes de gerar código** — projeto acadêmico com avaliação por equipe não tolera retrabalho silencioso.