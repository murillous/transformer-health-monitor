# 📐 Padrões de Código e Convenções

Convenções da equipe para manter o código consistente e revisável. Leia antes do primeiro commit.

---

## Princípios gerais

1. **Código claro vence código clever.** Se precisa de comentário pra entender, simplifica.
2. **Nomes descritivos.** Variáveis chamadas `x`, `tmp`, `data` são proibidas fora de loops curtos.
3. **Funções curtas.** Ideal: 20 linhas. Aceitável: 50. Acima disso, divida.
4. **Zero `delay()` no firmware.** Use `millis()`. Sem exceções.

---

## C++ / Firmware

### Nomenclatura

| Elemento | Estilo | Exemplo |
|---|---|---|
| Variável local | `snake_case` | `temperatura_atual` |
| Função | `snake_case` ou `camelCase` (consistente no arquivo) | `ler_temperatura()` ou `lerTemperatura()` |
| Constante | `SCREAMING_SNAKE_CASE` | `INTERVALO_MS` |
| Macro | `SCREAMING_SNAKE_CASE` | `#define PINO_DS18B20 4` |
| Tipo / struct | `PascalCase` | `Leitura`, `MqttClient` |
| Namespace | `lowercase` | `mpu6050::ler()` |

### Constantes: `constexpr` em vez de `#define`

❌ **Antigo (C):**
```cpp
#define MPU_ADDR 0x68
```

✅ **Atual (C++):**
```cpp
constexpr uint8_t MPU_ADDR = 0x68;
```

Vantagens: tem tipo definido, é verificado pelo compilador, não polui macros globais.

### Variáveis `static` em arquivo `.cpp`

Toda variável em escopo de arquivo (fora de funções) deve ser `static`:

```cpp
// dentro de mpu6050.cpp
static OneWire oneWire(PINO_DS18B20);  // bom: visível só neste arquivo
```

Sem `static`, duas variáveis com mesmo nome em arquivos diferentes geram erro de linker.

### `const` em todos os parâmetros e variáveis que não mudam

```cpp
void publicarLeitura(const char* topico, const float valor)
{
    const unsigned long agora = millis();
    // ...
}
```

Comunica intenção e permite otimizações do compilador.

### Comentários: Doxygen em funções públicas, `//` curtos em lógica

```cpp
/**
 * @brief Calcula a tensão RMS de um sinal AC.
 *
 * @param pino  Pino analógico de entrada
 * @return      Tensão RMS em volts
 */
float calcularRMS(uint8_t pino)
{
    float somatorio = 0.0f;

    // Acumula quadrados das amostras (definição de RMS)
    for (int i = 0; i < N_AMOSTRAS_RMS; i++) {
        // ...
    }

    return sqrt(somatorio / N_AMOSTRAS_RMS);
}
```

**Não comentar o óbvio:**

```cpp
// ❌ Ruim — não diz nada
i++;  // incrementa i

// ✅ Bom — quando o "por quê" não é óbvio
sensor.setResolution(12);  // padrão — outras resoluções quebram no Proteus
```

### Organização de um módulo

Cada par `.h`/`.cpp` segue o mesmo padrão:

**`modulo.h`:**
```cpp
#pragma once
#include <Arduino.h>

namespace modulo {

// Tipos públicos (struct, enum)
struct Resultado { ... };

// Funções públicas
bool      iniciar();
Resultado ler();

} // namespace modulo
```

**`modulo.cpp`:**
```cpp
#include "modulo.h"
#include "config.h"

namespace {
    // Constantes e helpers privados (escopo deste arquivo só)
    constexpr uint8_t REG_INTERNO = 0x10;

    static int contadorInterno = 0;

    static int funcaoAuxiliar() { ... }
}

namespace modulo {

bool iniciar() { ... }
Resultado ler() { ... }

} // namespace modulo
```

### Strings constantes: usar `F()` no Arduino

`F()` mantém a string na flash em vez de carregar para a RAM (que é escassa no UNO):

```cpp
// ❌ Ocupa RAM (preciosa)
Serial.println("Sensor inicializado");

// ✅ Fica na flash
Serial.println(F("Sensor inicializado"));
```

No ESP32 a diferença é menor (mais RAM disponível), mas manter `F()` é compatível e bom hábito.

### `delay()` é proibido em qualquer parte do firmware

Toda temporização usa `millis()`:

```cpp
// ❌ Bloqueia todo o sistema por 2 segundos
void loop() {
    lerSensores();
    delay(2000);
}

// ✅ Loop livre, executa quando hora chega
void loop() {
    if (millis() - ultimaLeitura < INTERVALO_MS) return;
    ultimaLeitura = millis();
    lerSensores();
}
```

Se aparecer um caso onde parece "necessário" usar `delay()` (geralmente por timing de protocolo de sensor), **primeiro investigue se o problema é de configuração** — foi o caso do DS18B20 no Proteus, que parecia exigir `delay(750)` mas na verdade só precisava de ajuste das propriedades do modelo. Detalhes em [`05-pegadinhas-proteus.md`](./05-pegadinhas-proteus.md).

---

## Python / Motor fuzzy + ponte serial

A IHM principal é a stack TS em `supervision/`. Python aparece em dois lugares:

- `supervision/apps/intelligence/` — motor fuzzy chamado via subprocess pelo server.
- `tools/serial_bridge/` — ponte Serial→MQTT para a simulação Proteus.

### Nomenclatura

| Elemento | Estilo |
|---|---|
| Variável, função | `snake_case` |
| Constante | `SCREAMING_SNAKE_CASE` |
| Classe | `PascalCase` |
| Módulo (arquivo) | `snake_case.py` |

### Type hints sempre que possível

```python
def calcular_rms(amostras: list[float], offset: float) -> float:
    return math.sqrt(sum((x - offset) ** 2 for x in amostras) / len(amostras))
```

### Docstrings em funções públicas

```python
def publicar_alarme(tipo: str, valor: float, limite: float) -> None:
    """
    Publica um alarme no broker MQTT com o nível de severidade adequado.

    Args:
        tipo: Identificador do alarme (ex.: 'vibracao_120hz')
        valor: Valor medido que disparou o alarme
        limite: Limiar que foi ultrapassado
    """
    # ...
```

---

## TypeScript / Supervision

A stack `supervision/` segue:

- **ESM puro**, sem CommonJS — imports sem extensão `.js`.
- **Tipos compartilhados** sempre em `packages/shared`. Nunca duplicar tipos entre `apps/server` e `apps/web`.
- **Zod schemas** para validar mensagens entrando pelo `MQTTSubscriber` e pelas rotas REST.
- **Hooks React** isolados em `apps/web/src/hooks/` — cada um com responsabilidade única (`useWebSocket`, `useDashboard`, `useTheme`).
- **shadcn/ui** preferido sobre componentes manuais. Tailwind para estilos pontuais.
- **Sem `any` implícito** — o `tsconfig.base.json` força `strict`. Quando precisar escapar, comente o porquê.

---

## Git / Workflow

### Branches

- `main` — sempre estável, deve compilar e rodar
- `dev` — integração de features
- `feature/<descrição-curta>` — uma feature por branch

Exemplo:
```bash
git checkout -b feature/fft-vibracao
# ...trabalho...
git push origin feature/fft-vibracao
# abre PR para dev
```

### Commits

Padrão (inspirado no Conventional Commits):

```
<tipo>: <descrição curta no imperativo>

[corpo opcional explicando o porquê]
```

Tipos usados:

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `refactor` | Mudança que não altera comportamento |
| `docs` | Apenas documentação |
| `chore` | Build, dependências, configuração |
| `test` | Adicionar ou ajustar testes |

**Exemplos:**

```
feat: adiciona detecção de inrush no SCT-013 primário
fix: corrige cache de temperatura quando primeira leitura é inválida
refactor: extrai publicador para módulo separado
docs: atualiza README com estrutura modular
chore: adiciona PubSubClient às dependências
```

### Pull Requests

- PR pequeno (ideal: <300 linhas alteradas)
- Descrição responde: **o quê** mudou, **por quê** mudou, **como testar**
- Pelo menos uma revisão de outro membro antes do merge

---

## Code Review — o que verificar

Ao revisar PR de um colega:

- [ ] Compila sem warnings
- [ ] Funciona na simulação (se for firmware)
- [ ] Segue as convenções de nomenclatura
- [ ] Tem documentação Doxygen nas funções públicas
- [ ] **Não introduz `delay()` em nenhuma parte do firmware**
- [ ] Strings literais usam `F()`
- [ ] Constantes usam `constexpr` em vez de `#define`
- [ ] Variáveis em escopo de arquivo são `static`
- [ ] Não há código comentado ou `print` de debug deixado para trás
- [ ] Sinais derivados ficam em módulo dedicado (`diagnostico`, `analise_vibracao`), não dentro do `main.cpp`
- [ ] Alarmes usam `publicador::publicarAlarme()` e não montam JSON fora da camada de transporte

---

## Ferramentas recomendadas

- **clang-format** com preset Google ou LLVM para manter estilo automático
- **PlatformIO** já vem com PIO Check (análise estática) — rodar antes de PRs grandes
- **PyLint** ou **Ruff** para Python
- **MQTT Explorer** para debug do broker

---

## Quando quebrar uma regra

Se você acha que precisa quebrar uma das regras acima, **traz pra discussão no grupo antes** — talvez a regra precise mudar, talvez exista uma solução melhor que você não enxergou. Foi assim que descobrimos a solução do DS18B20 no Proteus: a "necessidade" de `delay()` desapareceu ajustando as propriedades do modelo. Investigar configuração antes de assumir que a regra precisa ser quebrada quase sempre vale a pena.
