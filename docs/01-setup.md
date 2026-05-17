# 🛠️ Setup do Ambiente

Guia completo para preparar a máquina e rodar o pipeline **Proteus → Dashboard** do zero. Leva cerca de 1h na primeira vez. Cada passo tem um critério de validação no final — não pule.

---

## Visão geral do pipeline

```
Proteus (Arduino UNO + sensores simulados)
   └─► COMPIM no esquemático (escreve em COM4)
       └─► com0com par COM4↔COM5 (loopback virtual)
           └─► tools/serial_bridge/bridge.py lê COM5
               └─► publish Mosquitto :1883
                   └─► supervision/apps/server (MQTTSubscriber)
                       └─► WebSocket
                           └─► supervision/apps/web (dashboard React :5173)
```

No hardware físico (ESP32) tudo a partir do `Mosquitto` é igual — o ESP32 fala MQTT direto e a ponte serial deixa de ser necessária.

---

## Pré-requisitos por sistema operacional

| Componente | Windows | Linux | macOS |
|---|---|---|---|
| Proteus 8.x | ✅ nativo | ⚠️ via Wine | ❌ não suportado |
| com0com (par COM virtual) | ✅ obrigatório | ❌ usar `socat` | ❌ usar `socat` |
| Mosquitto | ✅ via instalador | ✅ apt/brew | ✅ brew |
| Node 20+ | ✅ | ✅ | ✅ |
| Python 3.10+ | ✅ | ✅ | ✅ |
| PlatformIO (VSCode) | ✅ | ✅ | ✅ |

O foco abaixo é Windows (plataforma de desenvolvimento atual da equipe). Equivalentes Linux estão indicados onde diferem.

---

## 1. Instalar PlatformIO no VSCode

1. Abrir o VSCode
2. `Extensions` (`Ctrl+Shift+X`)
3. Buscar **PlatformIO IDE** (autor: PlatformIO)
4. `Install` (≈5 min — baixa toolchains AVR e ESP32)
5. Reiniciar o VSCode

**Validação:** abrir o terminal integrado (`` Ctrl+` ``) e rodar `pio --version`. Deve imprimir algo como `PlatformIO Core, version 6.x`.

---

## 2. Instalar Proteus 8.x e bibliotecas

### Proteus

Instalador oficial em `labcenter.com`. Versão 8.13+ recomendada.

### Biblioteca MPU6050

A biblioteca do MPU6050 não é nativa do Proteus.

1. Acessar [electronicstree.com/new-mpu6050-proteus-library](https://electronicstree.com/new-mpu6050-proteus-library/)
2. Baixar o `.zip` (senha: `electronicstree.com`)
3. Extrair e copiar:
   - `MPU6050.LIB` e `MPU6050.IDX` → `C:\ProgramData\Labcenter Electronics\Proteus 8 Professional\LIBRARY\`
   - `MPU6050.DLL` → `C:\ProgramData\Labcenter Electronics\Proteus 8 Professional\MODELS\`
4. Reiniciar o Proteus

> **Erro "External model DLL not found":** instalar os redistribuíveis Visual C++ x86 e x64 da Microsoft ([vc_redist.x86.exe](https://aka.ms/vs/17/release/vc_redist.x86.exe), [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)) e reiniciar.

### Configurar o modelo DS18B20 no esquemático

Os timings padrão do modelo do Proteus são incompatíveis com a biblioteca DallasTemperature — sem isso, leituras retornam `-127` ou `NaN`.

Clique duplo no DS18B20 e configurar:

| Propriedade | Valor |
|---|---|
| Data Pulse Delay High | 40µs |
| Data Pulse Delay Low | 140µs |
| Time Reset Low | 400µs |
| Time Slot | 120µs |
| Conversion Time | 10ms |
| Data Write Time | 1ms |

**Validação:** ainda não dá para testar — espere terminar o setup do firmware e abra a simulação. As leituras de temperatura devem sair em °C realistas.

---

## 3. Compilar e gravar o firmware

```powershell
cd C:\Users\<voce>\repos\transformer-health-monitor
pio run -e uno
```

O `.hex` sai em `.pio/build/uno/firmware.hex`. No esquemático Proteus, clique duplo no Arduino UNO → campo **Program File** → apontar para esse arquivo.

> Tudo que você precisa para o ESP32 também já está em `platformio.ini` (`env:esp32`). Trocar de ambiente é só selecionar no rodapé do VSCode.

**Validação:** dê **Play** no Proteus, abra o **Virtual Terminal** e confirme que linhas `[MQTT] transformador/... -> {...}` começam a aparecer a cada ~2s.

---

## 4. Instalar e configurar Mosquitto

### Windows

Baixar em [mosquitto.org/download](https://mosquitto.org/download/) e executar o instalador.

Após instalar, criar/editar `C:\Program Files\mosquitto\mosquitto.conf` com:

```
listener 1883
allow_anonymous true
```

Reiniciar o serviço em PowerShell **como administrador**:

```powershell
Restart-Service mosquitto
```

### Linux

```bash
sudo apt update
sudo apt install mosquitto mosquitto-clients

sudo tee /etc/mosquitto/conf.d/local.conf <<EOF
listener 1883
allow_anonymous true
EOF

sudo systemctl restart mosquitto
```

### Validação (qualquer SO)

Dois terminais:

```powershell
# Terminal A
mosquitto_sub -h localhost -t "teste" -v
```

```powershell
# Terminal B
mosquitto_pub -h localhost -t "teste" -m "ping"
```

Terminal A deve imprimir `teste ping`. Se nada aparecer, o broker não está escutando em `0.0.0.0:1883` — revisar o `mosquitto.conf` e reiniciar o serviço.

---

## 5. Criar o par de portas COM virtuais (Windows)

A ponte Python precisa ler o que o Proteus escreve. com0com cria duas portas virtuais ligadas entre si — Proteus escreve numa ponta, a ponte lê na outra.

### Instalar com0com

1. Baixar a versão **signed** em [sourceforge.net/projects/com0com](https://sourceforge.net/projects/com0com/files/). A versão *unsigned* falha no Windows 10/11.
2. **Importante (Windows 11):** se o instalador não enxergar as portas no Device Manager mesmo após reiniciar, o driver foi bloqueado pelo Secure Boot. Entrar na UEFI e **desativar Secure Boot** — o driver da com0com é assinado por entidade não-Microsoft e o Win11 rejeita por padrão. Reinstalar após desativar.
3. Concluir a instalação normalmente.

### Criar o par

Abrir o atalho **Setup Command Prompt** do com0com (instalado junto). Executar:

```
install PortName=COM4 PortName=COM5
quit
```

Abrir o **Device Manager** → seção `com0com - serial port emulators` → confirmar `COM4` e `COM5` listadas.

### Equivalente Linux

```bash
socat -d -d pty,raw,echo=0,link=/tmp/ttyV0 pty,raw,echo=0,link=/tmp/ttyV1
```

Resulta em `/tmp/ttyV0` e `/tmp/ttyV1` espelhadas. Substituir `COM4`/`COM5` por esses paths nos passos seguintes.

### Validação

Em dois terminais Python:

```powershell
# Terminal A — lê COM5
python -c "import serial; s=serial.Serial('COM5',9600,timeout=5); print(s.readline())"
```

```powershell
# Terminal B — escreve em COM4
python -c "import serial; s=serial.Serial('COM4',9600); s.write(b'hello\r\n')"
```

Terminal A deve imprimir `b'hello\r\n'`. Se travar ou der erro de "Access denied", outro programa está com a porta aberta — fechar.

> Se Python não estiver instalado: `winget install Python.Python.3.12`.

---

## 6. Configurar o COMPIM no esquemático Proteus

O COMPIM mapeia a serial simulada do Arduino para uma COM real do Windows. **Sem ele, a ponte Python não tem o que ler.**

1. Pausar a simulação se estiver rodando.
2. No modo `Component Mode`, clicar `Pick Devices` (atalho **P**) → procurar `COMPIM` → adicionar ao projeto.
3. Posicionar o COMPIM no esquemático ao lado do Arduino. O Virtual Terminal pode coexistir — útil para debug.
4. **Ligar o pino TXD do Arduino (D1/PD1) ao pino TXD do COMPIM.** Sim, **TXD ↔ TXD** — o COMPIM é uma ponte virtual, não um dispositivo serial convencional, e seu TXD é a entrada para o host. O RXD do COMPIM (saída para o circuito) pode ficar solto, porque o firmware não lê comandos pela serial.
5. Clique duplo no COMPIM → propriedades:

| Propriedade | Valor |
|---|---|
| Physical port | `COM4` |
| Physical Baud Rate | `9600` |
| Physical Data Bits | `8` |
| Physical Parity | `NONE` |
| Virtual Baud Rate | `9600` |
| Virtual Data Bits | `8` |

> **Por que 9600 (e não 115200)?** O ATmega328P real do UNO suporta 115200 sem problema, mas o **simulador Proteus** roda o core mais devagar e perde bits acima de 9600 — testado empiricamente. O `config.h` seleciona `BAUD_SERIAL = 9600` no UNO e `115200` no ESP32 via `#if defined(ESP32)`. Se mudar o firmware, lembre de ajustar baud do COMPIM **e do Virtual Terminal** — desencontro = lixo na tela.
>
> A 9600, o ciclo de 2s comporta 7 escalares + espectro de 5 harmônicas (~180 chars) com folga grande na banda. Se ampliar a lista de harmônicas em `main.cpp::FREQS_HARMONICAS`, recalcule — cada harmônica extra adiciona ~35 chars (~36ms a 9600).

6. Salvar o projeto.

> **Atenção:** se outro programa estiver com `COM4` aberta (Arduino IDE, bridge anterior, PuTTY), o COMPIM falha silenciosamente. Fechar tudo antes de dar Play.

### Validação

Dar Play no Proteus. Em outro terminal:

```powershell
python -c "import serial; s=serial.Serial('COM5',115200,timeout=5); [print(s.readline()) for _ in range(5)]"
```

Devem aparecer 5 linhas `b'[MQTT] transformador/...\\r\\n'`. Se vazio, o COMPIM não mapeou ou TXD não foi conectado.

---

## 7. Instalar e rodar a ponte Serial→MQTT

```powershell
cd C:\Users\<voce>\repos\transformer-health-monitor\tools\serial_bridge
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python bridge.py --port COM5 --baud 9600 --broker localhost
```

Com Proteus em Play e Mosquitto rodando, a ponte imprime uma linha por mensagem:

```
-> transformador/nucleo/temperatura {"ts":1748000000,"valor":26.5,"unidade":"C"}
```

O `ts` original do Arduino (uptime em segundos) é reescrito pelo timestamp Unix da máquina antes de publicar.

### Validação cruzada

Em outro terminal:

```powershell
mosquitto_sub -h localhost -t "transformador/#" -v
```

Mesmos tópicos aparecem aqui. Se a ponte imprime mas o subscriber não recebe → broker no endereço errado ou firewall bloqueando.

---

## 8. Subir a stack `supervision/`

```powershell
cd C:\Users\<voce>\repos\transformer-health-monitor\supervision
npm install        # primeira vez
pip install -r apps/intelligence/requirements.txt   # primeira vez

npm run dev
```

`npm run dev` sobe `server` (:3001) e `web` (:5173) em paralelo. O log do server deve mostrar:

```
MQTT conectado em mqtt://localhost:1883
Inscrito em N tópicos
Server rodando em :3001
```

Se quiser rodar sem broker (UI puro, dados sintéticos via `/api/simular/iniciar`):

```powershell
npm run dev:server:offline   # equivalente ao MQTT_BROKER=none
```

---

## 9. Abrir o dashboard e validar end-to-end

Abrir `http://localhost:5173`.

Com Proteus em Play + ponte rodando + Mosquitto rodando + server conectado:

- Cards de temperatura, ΔT, corrente primária/secundária, vibração 120Hz e 240Hz se atualizam a cada ~2s.
- Espectro FFT mostra 5 barras nas harmônicas alvo (120, 240, 360, 480, 600Hz) quando há sinal.
- Painel de diagnóstico fuzzy roda a cada ciclo, mostrando risco operacional e tendências.
- Alarmes aparecem em toast e ficam registrados em `Alertas`.

Se o dashboard estiver parado, percorra a tabela de troubleshooting em [`03-mqtt.md`](./03-mqtt.md#debug-rápido).

---

## 10. (Opcional) Setup do Hardware Físico (ESP32)

O ESP32 dispensa COMPIM e ponte serial. Ele fala MQTT diretamente.

Antes de gravar:

1. Definir as credenciais via **variáveis de ambiente** (não edite o código — `platformio.ini` lê elas como build flags):

```powershell
# Windows PowerShell
$env:WIFI_SSID = "RedeReal"
$env:WIFI_PASS = "SenhaSegura"
$env:MQTT_BROKER = "192.168.1.100"   # IP da máquina do broker
```

```bash
# Linux/macOS
export WIFI_SSID=RedeReal
export WIFI_PASS=SenhaSegura
export MQTT_BROKER=192.168.1.100
```

Se as vars não estiverem setadas o firmware compila com placeholders (`SUA_REDE` etc.) e nunca conecta — útil só pra validar build.

2. Compilar e gravar:

```powershell
pio run -e esp32 -t upload
pio device monitor -b 115200
```

3. Garantir que a máquina do broker está acessível pelo ESP32 (firewall liberado em `:1883`, mesma rede WiFi).

A stack `supervision/` continua funcionando exatamente igual — o subscriber MQTT não distingue Proteus de ESP32.

---

## Ordem de subida (toda vez)

1. Mosquitto (Windows: serviço automático; Linux: `sudo systemctl start mosquitto`)
2. Ponte: `python tools/serial_bridge/bridge.py --port COM5`
3. Proteus → Play
4. `cd supervision && npm run dev`

Derrubar na ordem inversa. Reabrir Proteus enquanto a ponte está com a COM5 aberta funciona — Proteus escreve em COM4, ponte lê em COM5, não há conflito.

---

## Problemas comuns

### `pio` não é reconhecido
Reinicie o VSCode após instalar PlatformIO. No Windows, use o terminal do **VSCode**, não o CMD geral.

### Compilação falha "library not found"
Apague a pasta `.pio` e recompile — força reinstalar libs.

### Proteus trava ao dar Play
- `.hex` foi carregado no Arduino UNO?
- Biblioteca MPU6050 instalada?
- Proteus 8.13+?

### DS18B20 retorna -127
Não ajustou as propriedades do modelo (passo 2).

### `mosquitto_sub` vazio
- Bridge imprime linhas? Se não, COMPIM não foi cabeado para TXD→TXD ou está usando porta errada.
- Bridge imprime mas subscriber não? Broker em endereço diferente.

### Dashboard parado
- Server logou "MQTT conectado"? Se não, ainda está em `dev:server:offline` ou broker indisponível.
- WebSocket logou erro no console do navegador? Reiniciar `npm run dev`.

### com0com não cria as portas
Driver bloqueado pelo Secure Boot. Desativar na UEFI e reinstalar.

### "Access denied" abrindo COM5 na ponte
Outro programa segura a porta. Fechar Arduino IDE, PuTTY, monitor serial, instâncias antigas da ponte.

### Erro `Logic contention` no Proteus
Ignorar — é o comportamento normal do barramento OneWire (DS18B20).

---

## Próximos passos

- [`02-arquitetura.md`](./02-arquitetura.md) — organização do firmware
- [`03-mqtt.md`](./03-mqtt.md) — tópicos, payloads, COMPIM, ponte, broker
- [`04-padroes-codigo.md`](./04-padroes-codigo.md) — convenções da equipe
- [`05-pegadinhas-proteus.md`](./05-pegadinhas-proteus.md) — comportamentos não-óbvios catalogados
- [`ROADMAP.md`](./ROADMAP.md) — status atual e o que falta
- [`../supervision/README.md`](../supervision/README.md) — detalhes da stack de supervisão
