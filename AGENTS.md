# AGENTS.md

Instruções para agentes de IA (Codex, Cursor, Copilot Agent, etc.) trabalharem neste repositório.

---

## Sobre o projeto

Sistema embarcado para diagnóstico preditivo de transformadores elétricos. Projeto acadêmico de Engenharia da Computação — UEMA, 2026.

**Arquitetura em duas plataformas-alvo:**

- Simulação em Proteus com Arduino UNO (entrega 18/05/2026)
- Hardware real com ESP32 (entrega 15/06/2026)

O mesmo código fonte compila para os dois alvos. A seleção é automática via macros do compilador (`#if defined(ESP32)`). **Nunca duplique arquivos por plataforma.**

---

## Dev environment

### Stack

| Componente | Versão / Detalhe |
|---|---|
| Build system | PlatformIO (extensão VSCode) |
| Linguagem firmware | C++ (Arduino framework) |
| Linguagem IHM | Python 3.10+ |
| Simulador | Proteus 8.x |
| Broker MQTT | Mosquitto |

### Setup completo

```bash
# Clone
git clone <repo-url>
cd diagnostico_transformador

# PlatformIO instala libs automaticamente na primeira build
pio run -e uno
```

Documentação detalhada do setup: `docs/01-setup.md`.

---

## Build & test

```bash
# Compilar para Arduino UNO (simulação Proteus)
pio run -e uno

# Compilar para ESP32 (hardware físico)
pio run -e esp32

# Limpar build
pio run -t clean

# Gravar no ESP32 (USB conectado)
pio run -e esp32 -t upload

# Monitor serial
pio device monitor -b 9600
```

**Artefato da simulação:** `.pio/build/uno/firmware.hex` deve ser carregado no Arduino UNO dentro do Proteus para rodar a simulação.

**Não há testes unitários automatizados** ainda — validação é manual via Virtual Terminal no Proteus.

---

## Code style

### C++ (firmware)

**Nomenclatura:**

| Elemento | Estilo |
|---|---|
| Variável local | `snake_case` |
| Função | `snake_case` ou `camelCase` (consistente por arquivo) |
| Constante | `SCREAMING_SNAKE_CASE` |
| Tipo / struct | `PascalCase` |
| Namespace | `lowercase` |

**Constantes:** sempre `constexpr` com tipo explícito, nunca `#define`.

```cpp
// Correto
constexpr uint8_t PINO_DS18B20 = 4;
constexpr float   VREF         = 5.0f;

// Errado
#define PINO_DS18B20 4
```

**Strings literais no Arduino:** sempre envolver em `F()` para manter em flash.

```cpp
Serial.println(F("Iniciando..."));  // correto — usa flash
Serial.println("Iniciando...");     // errado — gasta RAM (UNO tem só 2KB)
```

**Variáveis em escopo de arquivo:** sempre `static`.

```cpp
static int contador = 0;  // só visível dentro deste .cpp
```

**Comentários:** Doxygen em funções públicas, `//` para lógica não-óbvia. Não comente o óbvio.

```cpp
// CORRETO — explica o porquê
sensor.setResolution(12);  // padrão — outras resoluções quebram no Proteus

// ERRADO — não diz nada
i++;  // incrementa i
```

### Python (IHM)

- `snake_case` para tudo exceto classes (`PascalCase`)
- Type hints obrigatórios em funções públicas
- Docstrings no estilo Google em funções não-triviais

---

## Architecture rules

### Estrutura modular obrigatória

Cada sensor é um módulo independente em `src/`:

```
src/
  sensor.h     ← interface pública dentro de namespace
  sensor.cpp   ← implementação, com tudo privado em namespace anônimo
```

Padrão de cada módulo:

```cpp
// sensor.h
#pragma once
#include <Arduino.h>

namespace sensor {
    bool      iniciar();
    Leitura   ler();
}
```

```cpp
// sensor.cpp
#include "sensor.h"
#include "config.h"

namespace {
    // tudo privado aqui (constantes, helpers)
    static int variavel_interna = 0;
    static int funcao_auxiliar() { ... }
}

namespace sensor {
    // implementações públicas aqui
}
```

**Ao adicionar um sensor novo:** criar par `.h`/`.cpp`, adicionar pino em `config.h`, incluir no `main.cpp`. **Não modifique outros módulos.**

### Camada de transporte unificada

Toda saída de dados de sensor passa por `publicador::publicar()`:

```cpp
publicador::publicar("transformador/nucleo/temperatura", 26.5, "C");
```

Internamente, a função seleciona Serial (Arduino UNO) ou MQTT (ESP32) via `#if defined(ESP32)`.

**Nunca chame `Serial.print()` diretamente para dados de sensor.** Reserve `Serial.print()` para logs de inicialização e diagnóstico.

### Loop principal não-bloqueante

```cpp
// CORRETO
void loop() {
    if (millis() - ultimaLeituraMs < INTERVALO_MS) return;
    ultimaLeituraMs = millis();
    // ...
}

// ERRADO — bloqueia todo o sistema
void loop() {
    lerSensores();
    delay(2000);
}
```

**Não há `delay()` justificado em nenhuma parte do firmware atual.** Se uma situação parecer exigir `delay()` (geralmente por timing de protocolo de sensor), investigar primeiro se o problema é de configuração do componente — foi o caso do DS18B20 no Proteus, que parecia precisar de `delay(750)` mas só precisava de ajuste de propriedades do modelo.

---

## Critical constraints

### Memória no Arduino UNO

- 32KB de flash total
- 2KB de RAM total
- Cuidado ao adicionar libs grandes (verificar com `pio run -e uno -v`)
- Strings sempre com `F()`
- Evitar `String` (classe do Arduino) — usar `char[]` com `snprintf`

### Detecção de plataforma

A macro `ESP32` é definida automaticamente pelo PlatformIO quando o ambiente é `env:esp32`. Use sempre:

```cpp
#if defined(ESP32)
    // código ESP32
#else
    // código Arduino UNO
#endif
```

### AVR não suporta `%f` em `printf`/`snprintf`

Para formatar float em string no UNO:

```cpp
char buf[16];
dtostrf(valor, 0, 4, buf);  // largura mínima 0, 4 casas decimais
snprintf(payload, sizeof(payload), "\"valor\":%s", buf);
```

`dtostrf` também existe no ESP32, então o código é portável.

### `Wire.requestFrom()` tem sobrecargas ambíguas no AVR

Resolva passando o endereço como `constexpr uint8_t` (não `#define int`):

```cpp
constexpr uint8_t MPU_ADDR = 0x68;
Wire.requestFrom(MPU_ADDR, (uint8_t)2);  // sem warning
```

---

## Known issues / não tentar consertar

Catálogo completo em `docs/05-pegadinhas-proteus.md`. Resumo:

| Issue | Status |
|---|---|
| MPU6050 trava eixo X em -1.00g no Proteus | Limitação do modelo da biblioteca ElectronicTree. Não impacta diagnóstico. |
| DS18B20 retorna -127 intermitentemente | **Resolvido** ajustando propriedades do modelo no Proteus (ver `docs/05-pegadinhas-proteus.md`). Cache no `ds18b20.cpp` mantido como salvaguarda. |
| `Logic contention` no log do Proteus | Comportamento normal do protocolo OneWire — **ignorar**. |
| MQTT real não funciona no Proteus | Proteus não simula WiFi. Usar a ponte serial→MQTT em Python (`ihm/ponte_serial_mqtt.py`). |
| VSINEs Primário/Secundário aparentam conectáveis ao TR1 | **Não conectar.** São simuladores independentes do sinal já condicionado do SCT-013. TR1 fica isolado como ilustração. |

---

## Commit conventions

Conventional Commits, em português:

```
feat: adiciona detecção de inrush no SCT-013 primário
fix: corrige cache de temperatura quando primeira leitura é inválida
refactor: extrai publicador para módulo separado
docs: atualiza README com estrutura modular
chore: adiciona PubSubClient às dependências
```

Imperativo, sem ponto final na primeira linha. Corpo opcional explicando o **porquê** (não o **quê** — o diff já mostra isso).

---

## Pull Requests

- Branch por feature: `feature/<descrição-curta>`
- Idealmente <300 linhas alteradas
- Descrição responde: o quê mudou, por quê, como testar
- Pelo menos uma revisão antes do merge para `dev`

Checklist antes de abrir PR:

- [ ] Compila sem warnings (`pio run -e uno`)
- [ ] Roda na simulação Proteus
- [ ] Segue nomenclatura do projeto
- [ ] Tem Doxygen em funções públicas novas
- [ ] **Sem `delay()` em nenhuma parte do firmware**
- [ ] Sem `Serial.print()` direto para dados de sensor
- [ ] `ROADMAP.md` atualizado se a tarefa estava listada lá

---

## Onde encontrar mais contexto

| Documento | Conteúdo |
|---|---|
| `README.md` | Visão geral, arquitetura, como rodar |
| `docs/01-setup.md` | Setup detalhado do ambiente |
| `docs/02-arquitetura.md` | Estrutura do firmware, como adicionar sensor |
| `docs/03-mqtt.md` | Tópicos, payloads, broker, ponte serial→MQTT |
| `docs/04-padroes-codigo.md` | Convenções completas (lê antes do primeiro commit) |
| `docs/05-pegadinhas-proteus.md` | Comportamentos não-óbvios do Proteus e workarounds |
| `docs/ROADMAP.md` | Status do projeto e o que falta — fonte da verdade |
| `docs/projeto_transformador.pdf` | Documento técnico formal para a avaliação |

---

## Diretrizes para agentes

- **Não invente funcionalidade.** Se o usuário pede algo ambíguo, pergunte antes de implementar.
- **Respeite a abstração existente.** Não crie novo módulo de comunicação paralelo ao `publicador` — estenda o existente.
- **Pense em ambas plataformas.** Toda mudança deve funcionar em Arduino UNO e ESP32 (ou ter ramo `#if defined(ESP32)` claro).
- **Não remova workarounds documentados** (cache do DS18B20, isolamento do TR1) sem entender por que existem.
- **Antes de propor `delay()`:** investigar se o problema real é de configuração. Não há `delay()` justificado no firmware atual.
- **Consulte o `ROADMAP.md`** antes de propor grandes mudanças — pode estar atribuído a outra pessoa.
- **Idioma da documentação e comentários:** português brasileiro. Nomes de variáveis e funções: português ou inglês são aceitáveis, mas seja consistente dentro do mesmo módulo.