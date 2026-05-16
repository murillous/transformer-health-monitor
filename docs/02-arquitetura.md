# 🛠️ Setup do Ambiente

Guia para preparar a máquina para desenvolvimento e simulação do projeto. Leva ~30 minutos na primeira vez.

---

## Pré-requisitos

- **Sistema operacional:** Windows 10/11, Linux (Ubuntu 20.04+) ou macOS
- **VSCode:** [code.visualstudio.com](https://code.visualstudio.com/)
- **Git:** [git-scm.com](https://git-scm.com/)
- **Proteus 8.x** (apenas Windows nativo — no Linux precisa de Wine)

---

## 1. Instalar PlatformIO no VSCode

1. Abra o VSCode
2. Vá em **Extensions** (`Ctrl+Shift+X`)
3. Busque por **PlatformIO IDE** (autor: PlatformIO)
4. Clique em **Install** e aguarde (~5 minutos)
5. Reinicie o VSCode quando terminar

> A primeira instalação baixa as toolchains (compiladores) automaticamente — não interrompa o processo.

---

## 2. Clonar o repositório

```bash
git clone <url-do-repositorio>
cd diagnostico_transformador
code .
```

Quando o VSCode abrir, o PlatformIO detectará o `platformio.ini` automaticamente e oferecerá para abrir o projeto. Aceite.

---

## 3. Instalar a biblioteca MPU6050 no Proteus

A biblioteca do MPU6050 não vem nativa no Proteus — precisa baixar separadamente.

1. Acesse [electronicstree.com/new-mpu6050-proteus-library](https://electronicstree.com/new-mpu6050-proteus-library/)
2. Baixe o arquivo `.zip` (senha: `electronicstree.com`)
3. Extraia o conteúdo
4. Copie os arquivos para as pastas correspondentes:
   - `MPU6050.LIB` → `C:\ProgramData\Labcenter Electronics\Proteus 8 Professional\LIBRARY\`
   - `MPU6050.IDX` → mesma pasta
   - `MPU6050.DLL` → `C:\ProgramData\Labcenter Electronics\Proteus 8 Professional\MODELS\`
5. Reinicie o Proteus

### Erro "External model DLL not found"?

Instale o **Visual C++ Redistributable** da Microsoft (ambas versões x86 e x64):
- [vc_redist.x86.exe](https://aka.ms/vs/17/release/vc_redist.x86.exe)
- [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

Reinicie o computador após a instalação.

---

## 4. Compilar o firmware

No terminal integrado do VSCode (`Ctrl+\``):

```bash
# Compilar para Arduino UNO (simulação Proteus)
pio run -e uno

# OU pela interface: Ctrl+Alt+B
```

As bibliotecas Arduino são instaladas automaticamente na primeira compilação (lidas do `platformio.ini`). O `.hex` gerado fica em `.pio/build/uno/firmware.hex`.

---

## 5. Carregar o .hex no Proteus

1. Abra `proteus/diagnostico.pdsprj`
2. Clique duplo no Arduino UNO no esquemático
3. No campo **Program File**, clique no ícone de pasta
4. Aponte para `.pio/build/uno/firmware.hex`
5. Clique **OK**
6. Pressione **Play** (canto inferior esquerdo)

O Virtual Terminal deve abrir mostrando as leituras dos sensores.

---

## 6. (Opcional) Instalar Mosquitto para testes MQTT

Necessário apenas se for trabalhar na camada IoT ou IHM.

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

**Windows:**  
Baixar instalador em [mosquitto.org/download](https://mosquitto.org/download/) e seguir o wizard.

**Testar funcionamento:**
```bash
# Terminal 1 — fica escutando
mosquitto_sub -h localhost -t "teste"

# Terminal 2 — publica
mosquitto_pub -h localhost -t "teste" -m "olá"
```

A mensagem deve aparecer no Terminal 1 instantaneamente.

---

## 7. (Opcional) Setup da IHM Python

Necessário apenas para P5 e P6.

```bash
cd ihm
python -m venv .venv

# Linux/macOS
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
```

---

## Problemas comuns

### `pio` não é reconhecido no terminal
- Reinicie o VSCode após instalar a extensão PlatformIO
- No Windows, abra o terminal **do VSCode**, não o CMD geral

### Compilação falha com "library not found"
- Apague a pasta `.pio` e compile de novo (força reinstalar libs)

### Proteus trava ao dar Play
- Confirme que o `.hex` foi carregado corretamente
- Verifique se a biblioteca MPU6050 está instalada
- Use Proteus 8.13 ou mais recente

### Erro `Logic contention` no log do Proteus
- **Pode ignorar.** É o comportamento normal do protocolo OneWire (DS18B20)

---

## Próximos passos

Depois de tudo funcionando, leia:
- [`02-arquitetura.md`](./02-arquitetura.md) para entender a organização do código
- [`04-padroes-codigo.md`](./04-padroes-codigo.md) antes do primeiro commit