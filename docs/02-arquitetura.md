# 🏗️ Arquitetura do Firmware

Como o código está organizado, por que está assim, e como estender sem quebrar nada.

---

## Princípios de design

O firmware segue três princípios não-negociáveis:

1. **Não-bloqueante:** zero `delay()` em qualquer parte do firmware. Todo controle de tempo usa `millis()`.
2. **Modular:** cada sensor é independente, com seu próprio par `.h`/`.cpp`.
3. **Portável:** o mesmo código compila para Arduino UNO (Proteus) e ESP32 (físico) sem alterações manuais.

---

## Estrutura de arquivos

```
src/
├── main.cpp          # Orquestração — setup() e loop()
├── config.h          # Pinos, calibração, constantes globais
├── publicador.h/cpp  # Camada de transporte (Serial / MQTT)
├── mpu6050.h/cpp     # Acelerômetro/giroscópio via I²C
├── ds18b20.h/cpp     # Temperatura via OneWire
├── sct013.h/cpp      # Corrente RMS via ADC
├── analise_vibracao.h/cpp  # Buffer MPU6050 + FFT 120/240Hz
└── diagnostico.h/cpp # ΔT, inrush e alarmes
```

Cada par `.h`/`.cpp` representa um **módulo independente**. O `main.cpp` apenas amarra os módulos no fluxo principal.

---

## Fluxo de dados

```
┌─────────────────────────────────────────────────────────────┐
│                          main.cpp                           │
│                                                             │
│  setup() ──┬─► publicador::iniciar()                        │
│            ├─► mpu6050::iniciar()                           │
│            ├─► ds18b20::iniciar()                           │
│            └─► (sct013 não precisa de init)                 │
│                                                             │
│  loop()  ──┬─► publicador::manter()        ← MQTT keepalive │
│            │                                                │
│            │   (a cada INTERVALO_MS)                        │
│            ├─► analise_vibracao::atualizar() ─► publicador  │
│            ├─► sct013::lerInstantaneoAbs(A0) ─► diagnostico │
│            │                                                │
│            │   (a cada INTERVALO_MS)                        │
│            ├─► mpu6050::ler()       ──┐                     │
│            ├─► ds18b20::lerTemperatura() ├──► diagnostico   │
│            ├─► sct013::lerRMS(A0)   ──┤      publicador::   │
│            └─► sct013::lerRMS(A1)   ──┘      publicar()     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │  publicador::publicar │
                  │                       │
                  │   #if defined(ESP32)  │
                  │     → mqtt.publish()  │
                  │   #else               │
                  │     → Serial.print()  │
                  │   #endif              │
                  └───────────────────────┘
```

---

## Responsabilidade de cada módulo

### `config.h` — Configuração global

Centraliza **tudo que muda entre plataformas**. Ao mudar de Arduino para ESP32, apenas este arquivo decide os valores corretos automaticamente via `#if defined(ESP32)`.

Define:
- Pinos dos sensores
- Calibração do ADC (VREF, resolução, bias)
- Parâmetros de amostragem
- Tópicos MQTT

**Quem mexe:** P1 (Hardware) e P4 (IoT).

### `publicador` — Camada de transporte

Abstrai **como** os dados são enviados. Quem chama `publicador::publicar()` não precisa saber se vai pro Serial ou pro MQTT.

```cpp
publicador::publicar("transformador/nucleo/temperatura", 26.5, "C");
```

No Arduino UNO, imprime no Serial em formato compatível com MQTT (linha começa com `[MQTT]`).  
No ESP32, publica de fato no broker via PubSubClient (com `mqtt.setBufferSize(1024)` para acomodar o payload de espectro).

Funções expostas:
- `publicar(topico, valor, unidade)` — payload `{ts, valor, unidade}` para qualquer escalar.
- `publicarAlarme(tipo, severidade, valor, limite, mensagem)` — payload estruturado em `transformador/status/alarme`.
- `publicarEspectro(topico, freqs[], amplitudes[], n_bins)` — array `{ts, espectro:[{freq, amplitude}…]}` com pares paralelos. No UNO, faz stream direto pelo `Serial.print`; no ESP32, monta um `char[400]` e publica. Caller decide quais frequências enviar — atualmente `main.cpp` envia só 120, 240, 360, 480, 600Hz.

**Quem mexe:** P4 (IoT & MQTT).

### `mpu6050` — Acelerômetro/giroscópio

Encapsula I²C, registradores, conversão de LSBs para unidades físicas (g e °/s).

Interface pública:
```cpp
bool             mpu6050::iniciar();   // verifica WHO_AM_I
mpu6050::Leitura mpu6050::ler();       // retorna struct com 6 valores
```

**Quem mexe:** P2 (Firmware Base).

### `ds18b20` — Temperatura

Encapsula OneWire, com **cache da última leitura válida** para tolerar falhas intermitentes do modelo no Proteus.

Interface pública:
```cpp
uint8_t ds18b20::iniciar();          // retorna quantidade de sensores
float   ds18b20::lerTemperatura();   // °C, ou NAN se nunca houve leitura válida
```

**Quem mexe:** P2 (Firmware Base).

### `sct013` — Corrente RMS

Amostragem ADC + cálculo RMS pela definição matemática (raiz da média dos quadrados, removendo offset DC).

Interface pública:
```cpp
float sct013::lerRMS(uint8_t pino);  // V_rms no pino A0 ou A1
float sct013::lerInstantaneoAbs(uint8_t pino);  // V_pico sem bias
```

**Quem mexe:** P3 (DSP & Algoritmos).

### `analise_vibracao` — FFT do MPU6050

Coleta amostras do eixo Z do MPU6050 de forma incremental, sem bloquear o `loop()`. Quando o buffer fecha, aplica remoção DC, janela Hamming, FFT e extrai amplitudes próximas de 120Hz e 240Hz, além de expor o vetor de magnitudes completo para publicação como espectro.

Interface pública:
```cpp
void analise_vibracao::iniciar();
analise_vibracao::Espectro analise_vibracao::atualizar();
const float*               analise_vibracao::magnitudes();
uint16_t                   analise_vibracao::numAmostras();
float                      analise_vibracao::frequenciaAmostragemHz();
float                      analise_vibracao::amplitudeEmFreq(float hz);  // bin mais próximo
```

No Arduino UNO, o buffer usa 32 amostras @ 1920Hz → 16 bins úteis, Nyquist = 960Hz. Resolução espectral = **60Hz/bin** — múltiplos de 120Hz caem em bins pares sem leakage (120Hz→2, 240Hz→4, 360Hz→6, 480Hz→8, 600Hz→10). N=32 é o teto prático no AVR — N=64 (testado) satura a RAM e trava o firmware no Proteus. O alinhamento foi pensado para a frequência de magnetostrição do núcleo (120Hz) e suas harmônicas. O `main.cpp` extrai as amplitudes das 5 harmônicas alvo via `amplitudeEmFreq()` e chama `publicador::publicarEspectro()` com arrays paralelos `freqs[]`/`amplitudes[]`. Publicação acontece no tick lento (não em cada FFT — evita saturar o Serial 9600 do Proteus). No ESP32, N pode ser aumentado depois (tem RAM de sobra) se a validação física exigir maior resolução espectral.

**Quem mexe:** P3 (DSP & Algoritmos).

### `diagnostico` — ΔT, Inrush e Alarmes

Centraliza regras que combinam leituras de mais de um módulo. Calcula ΔT contra temperatura ambiente configurada, detecta inrush por máquina de estados (`idle → monitorando → cooldown`) e publica alarmes estruturados via `publicador`.

Interface pública:
```cpp
float diagnostico::calcularDeltaT(float temperatura_nucleo);
diagnostico::Inrush diagnostico::atualizarInrush(float corrente_primario_vpico);
void diagnostico::publicarAlarmes(float temperatura_nucleo, float delta_t,
                                  float fft_120hz,
                                  const diagnostico::Inrush& inrush);
```

**Quem mexe:** P3 (algoritmos) e P6 (limites/mensagens de diagnóstico).

### `main.cpp` — Orquestração

Não contém lógica de sensor. Apenas:
1. Chama `iniciar()` de cada módulo no `setup()`
2. Controla o intervalo do loop com `millis()`
3. Chama as funções de leitura e atualiza análises incrementais
4. Chama `diagnostico` para sinais derivados e alarmes
5. Chama `publicar()` com os resultados
6. Publica heartbeat (`TOPICO_HEARTBEAT`) a cada ciclo para o dashboard saber que o firmware está vivo

Se você precisa mexer no `main.cpp` para adicionar lógica de sensor, **provavelmente está no lugar errado** — provavelmente devia estar no módulo do sensor.

---

## Como adicionar um novo sensor

Vamos supor que você queira adicionar um sensor de tensão. Você precisa criar dois arquivos novos e tocar em três existentes:

### 1. Criar `src/tensao.h`

```cpp
#pragma once
#include <Arduino.h>

namespace tensao {
    void  iniciar();
    float ler();   // retorna tensão em volts
}
```

### 2. Criar `src/tensao.cpp`

```cpp
#include "tensao.h"
#include "config.h"

namespace tensao {

void iniciar() {
    pinMode(PINO_TENSAO, INPUT);
}

float ler() {
    // implementação
    return analogRead(PINO_TENSAO) * VREF / ADC_RES;
}

}
```

### 3. Adicionar pino em `config.h`

```cpp
constexpr uint8_t PINO_TENSAO = A2;  // ou GPIO32 no ESP32
```

### 4. Adicionar tópico em `config.h`

```cpp
constexpr const char* TOPICO_TENSAO = "transformador/secundario/tensao";
```

### 5. Chamar no `main.cpp`

```cpp
#include "tensao.h"

void setup() {
    // ...
    tensao::iniciar();
}

void loop() {
    // ...
    const float v = tensao::ler();
    publicador::publicar(TOPICO_TENSAO, v, "V");
}
```

**Pronto.** Nenhum outro arquivo precisa mudar.

---

## Portabilidade Arduino ↔ ESP32

A detecção de plataforma é automática via macros do compilador:

```cpp
// config.h
#if defined(ESP32)
    constexpr float VREF    = 3.3f;
    constexpr float ADC_RES = 4095.0f;
    constexpr float BIAS    = 1.65f;
#else
    constexpr float VREF    = 5.0f;
    constexpr float ADC_RES = 1023.0f;
    constexpr float BIAS    = 2.5f;
#endif
```

Quando o PlatformIO compila para `env:uno`, a macro `ESP32` não está definida → usa valores de 5V.  
Quando compila para `env:esp32`, a macro está definida → usa valores de 3,3V.

**Você nunca precisa editar o código manualmente** entre plataformas. Só selecionar o ambiente correto no rodapé do VSCode.

---

## Pontos de atenção

### Por que `namespace` em vez de classe?

O firmware é single-instance (não vai existir dois MPU6050 ao mesmo tempo). Namespace é mais leve, sem overhead de `this` pointer, e o código fica mais legível para o nosso caso.

### Por que `static` nas variáveis dentro do `.cpp`?

`static` em escopo de arquivo limita a visibilidade ao próprio arquivo. Sem isso, duas variáveis com o mesmo nome em arquivos diferentes causariam erro de linker.

### Por que `constexpr` em vez de `#define`?

`constexpr` tem tipo (`uint8_t`, `float` etc.) e é verificado pelo compilador. `#define` é texto puro — passa qualquer coisa. Use `constexpr` sempre que possível.

### Não-bloqueio do DS18B20 — solução pragmática

A versão original do código exigia `delay(750)` dentro de `lerTemperatura()` para aguardar a conversão de 12 bits do sensor. Isso violava o princípio não-bloqueante e seria uma exceção que precisaria ser justificada.

Durante o desenvolvimento, descobrimos que ajustando os **parâmetros de timing do modelo do Proteus** (não do código), o sensor passa a responder rápido o suficiente para que o `delay()` deixe de ser necessário.

**Parâmetros configurados no modelo do DS18B20 dentro do Proteus** (clique duplo no componente → propriedades):

| Propriedade | Valor |
|---|---|
| Data Pulse Delay High | 40µs |
| Data Pulse Delay Low | 140µs |
| Time Reset Low | 400µs |
| Time Slot | 120µs |
| Conversion Time | 10ms |
| Data Write Time | 1ms |

Com esses ajustes, o `requestTemperatures()` retorna em poucos milissegundos e a leitura imediatamente seguinte traz o valor correto. **Não há `delay()` em nenhuma parte do firmware.**

**No hardware físico (ESP32):** o sensor real respeita os tempos do datasheet do DS18B20 automaticamente. Se houver bloqueio perceptível com o sensor real, considerar implementar máquina de estados com `millis()` no módulo `ds18b20`. Por enquanto, o código atual deve funcionar sem alterações.

Para mais detalhes sobre essa e outras peculiaridades do Proteus, ver [`05-pegadinhas-proteus.md`](./05-pegadinhas-proteus.md).

---

## Próximos passos

- [`03-mqtt.md`](./03-mqtt.md) — entender a camada de comunicação
- [`04-padroes-codigo.md`](./04-padroes-codigo.md) — convenções antes de codar
- [`05-pegadinhas-proteus.md`](./05-pegadinhas-proteus.md) — comportamentos não-óbvios do Proteus
