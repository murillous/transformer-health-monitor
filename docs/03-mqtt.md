# 📡 Guia MQTT

Como o sistema comunica os dados dos sensores via MQTT — tópicos, payloads, broker e estratégia de simulação.

---

## O que é MQTT (em 1 minuto)

MQTT é um protocolo leve de mensagens publish/subscribe, ideal para IoT. Funciona assim:

```
Publisher (ESP32) ──► Broker (Mosquitto) ──► Subscriber (IHM Python)
```

- O **ESP32** publica mensagens em "tópicos" (strings hierárquicas)
- O **broker** distribui as mensagens
- A **IHM** se inscreve nos tópicos que interessa

Os três nem precisam estar online ao mesmo tempo — o broker faz buffer. Isso é diferente de HTTP, onde cliente e servidor precisam estar conectados simultaneamente.

---

## Estrutura dos tópicos

Tópicos seguem hierarquia separada por `/`, como um caminho de pasta. A organização adotada no projeto:

```
transformador/
├── primario/
│   ├── corrente          ← RMS da corrente no enrolamento de 220V
│   └── inrush            ← flag de surto de energização + pico
├── secundario/
│   ├── corrente          ← RMS da corrente no enrolamento de 12V
│   └── tensao_saida      ← (futuro) regulação sob carga
├── nucleo/
│   ├── temperatura       ← °C absolutos
│   └── delta_t           ← gradiente térmico
├── vibracao/
│   ├── aceleracao        ← g no eixo Z (bruto)
│   ├── fft_120hz         ← amplitude da frequência de magnetostrição
│   └── fft_240hz         ← amplitude da 2ª harmônica
└── status/
    ├── alarme            ← eventos críticos com severidade
    └── heartbeat         ← timestamp de "estou vivo"
```

**Por que essa organização:**

- **Subscribe seletivo:** a IHM pode escutar `transformador/#` (tudo) ou só `transformador/nucleo/+` (todas as temperaturas)
- **Escalabilidade:** se um dia monitorarmos vários transformadores, basta adicionar um identificador: `transformador/T01/primario/corrente`
- **Legibilidade:** o tópico sozinho já comunica o significado

---

## Formato do payload

Todos os tópicos numéricos seguem o mesmo formato JSON:

```json
{
  "ts": 1748000000,
  "valor": 26.5,
  "unidade": "C"
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `ts` | inteiro | Timestamp Unix em segundos (uptime no Arduino, real no ESP32) |
| `valor` | float | Valor medido, 4 casas decimais |
| `unidade` | string | Unidade física (`C`, `Vrms`, `g`, `A`, `s`) |

Para o tópico `transformador/status/alarme`, o payload é mais rico:

```json
{
  "ts": 1748000000,
  "tipo": "vibracao_120hz",
  "severidade": "warning",
  "valor": 0.42,
  "limite": 0.15,
  "mensagem": "Amplitude 120Hz acima do limiar"
}
```

---

## A camada `publicador` — onde MQTT acontece no firmware

Toda publicação passa por uma função única:

```cpp
publicador::publicar("transformador/nucleo/temperatura", 26.5, "C");
```

A função encapsula o JSON e seleciona automaticamente entre Serial (Proteus) e MQTT (ESP32) via `#if defined(ESP32)`.

**Implementação simplificada (`publicador.cpp`):**

```cpp
void publicar(const char* topico, float valor, const char* unidade) {
    char valorStr[16];
    dtostrf(valor, 0, 4, valorStr);

    char payload[96];
    snprintf(payload, sizeof(payload),
             "{\"ts\":%lu,\"valor\":%s,\"unidade\":\"%s\"}",
             millis() / 1000, valorStr, unidade);

#if defined(ESP32)
    mqtt.publish(topico, payload);
#else
    Serial.print(F("[MQTT] "));
    Serial.print(topico);
    Serial.print(F(" -> "));
    Serial.println(payload);
#endif
}
```

---

## Configurando o broker Mosquitto

### Instalação

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install mosquitto mosquitto-clients

# macOS (Homebrew)
brew install mosquitto

# Windows: instalador em mosquitto.org/download
```

### Permitir conexões da rede local

Por padrão o Mosquitto só aceita conexões de `localhost`. Para o ESP32 conseguir conectar:

```bash
echo "listener 1883
allow_anonymous true" | sudo tee /etc/mosquitto/conf.d/local.conf

sudo systemctl restart mosquitto
```

### Verificar funcionamento

```bash
# Terminal 1 — fica escutando todos os tópicos do projeto
mosquitto_sub -h localhost -t "transformador/#" -v

# Terminal 2 — publica uma mensagem de teste
mosquitto_pub -h localhost -t "transformador/teste" \
  -m '{"ts":1,"valor":42,"unidade":"X"}'
```

O Terminal 1 deve mostrar imediatamente:
```
transformador/teste {"ts":1,"valor":42,"unidade":"X"}
```

---

## Estratégia para a simulação Proteus (sem WiFi)

O Proteus não simula WiFi, então o Arduino UNO **não consegue falar MQTT diretamente**. A solução é uma **ponte serial → MQTT** em Python.

### Como funciona

1. Arduino no Proteus imprime no Serial usando o formato `[MQTT] topico -> payload`
2. O Proteus expõe a saída serial como uma porta COM virtual (via componente COMPIM ou exportação)
3. Um script Python (`ihm/ponte_serial_mqtt.py`) lê essa porta, extrai os payloads e publica no broker Mosquitto real
4. A IHM recebe os dados como se viessem do ESP32

### Esqueleto do script

```python
import serial
import paho.mqtt.client as mqtt
import re

PADRAO = re.compile(r'\[MQTT\] (\S+) -> (.+)')

ser = serial.Serial("COM4", 9600)  # ajustar para sua porta
mqtt_client = mqtt.Client()
mqtt_client.connect("localhost", 1883)

while True:
    linha = ser.readline().decode(errors="ignore").strip()
    match = PADRAO.match(linha)
    if match:
        topico, payload = match.groups()
        mqtt_client.publish(topico, payload)
        print(f"→ {topico}")
```

> **Importante:** a configuração da porta COM virtual no Proteus exige o componente **COMPIM** no esquemático e ajuste na propriedade `Physical port` para apontar para uma porta real (ex.: `COM4`). Em pares virtuais com `com0com` (Windows) ou `socat` (Linux), o Python lê a porta espelhada.

---

## Testando o pipeline completo

Antes de integrar com a IHM, valide manualmente:

```bash
# Terminal 1 — escuta o broker
mosquitto_sub -h localhost -t "transformador/#" -v
```

Rode a simulação no Proteus + a ponte Python. No Terminal 1 devem aparecer mensagens em tempo real:

```
transformador/primario/corrente {"ts":4,"valor":0.6914,"unidade":"Vrms"}
transformador/secundario/corrente {"ts":4,"valor":0.3461,"unidade":"Vrms"}
transformador/nucleo/temperatura {"ts":4,"valor":26.5000,"unidade":"C"}
transformador/vibracao/aceleracao {"ts":4,"valor":0.0000,"unidade":"g"}
```

Esse é o mesmo dado que o ESP32 vai publicar no hardware físico. Toda a IHM pode ser desenvolvida e testada já com esses dados.

---

## QoS (Quality of Service) — quando importa

MQTT tem 3 níveis de garantia de entrega:

| QoS | Significado | Quando usar |
|---|---|---|
| 0 | Fire-and-forget (sem confirmação) | Leituras periódicas — perder uma não é problema |
| 1 | Pelo menos uma vez (pode duplicar) | Alarmes — não pode perder |
| 2 | Exatamente uma vez (mais caro) | Quase nunca necessário |

Recomendação para o projeto:

```cpp
mqtt.publish("transformador/primario/corrente", payload);        // QoS 0 implícito
mqtt.publish("transformador/status/alarme", payload, true);      // retained=true
```

O `retained=true` no tópico de alarme guarda o último valor no broker. Quando a IHM Python conectar, ela recebe imediatamente o último estado mesmo sem aguardar a próxima publicação.

---

## Recursos externos

- [HiveMQ MQTT Essentials](https://www.hivemq.com/mqtt-essentials/) — tutorial oficial bem feito
- [Mosquitto docs](https://mosquitto.org/documentation/) — referência do broker
- [paho-mqtt (Python)](https://www.eclipse.org/paho/index.php?page=clients/python/index.php) — biblioteca da IHM
- [MQTT Explorer](http://mqtt-explorer.com/) — GUI para inspecionar o broker (super útil para debug)