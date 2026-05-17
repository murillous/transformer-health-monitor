# 🪤 Pegadinhas do Proteus

Catálogo de comportamentos não-óbvios do Proteus que afetam este projeto. **Leia antes de mexer no esquemático ou debugar problemas estranhos.** Cada item aqui custou tempo real de descobrimento — não invente roda quadrada.

---

## 1. As VSINEs Primário/Secundário NÃO são conectadas ao transformador

**Sintoma de quem não sabe disso:** tenta ligar as VSINEs em série com o TR1 para "monitorar a corrente real". Resultado: o circuito do Arduino satura, MPU6050 e DS18B20 falham, valores RMS do ADC ficam absurdos.

**Como é de verdade no projeto:**

```
PARTE 1 — Circuito real do transformador (apenas ilustrativo)
  Fonte 220V/60Hz ──→ TR1 ──→ R8 (carga)
  [não conectado a nada do Arduino]

PARTE 2 — Simulação do SCT-013 primário (independente)
  VSINE "Primário" (1V/60Hz) ──→ R(100Ω) ──→ C(10µF) ──→ Divisor ──→ A0

PARTE 3 — Simulação do SCT-013 secundário (independente)
  VSINE "Secundário" (0.5V/60Hz) ──→ R(100Ω) ──→ C(10µF) ──→ Divisor ──→ A1
```

**Por quê:** o Proteus não tem modelo do SCT-013. A estratégia é simular o **sinal já condicionado** que chegaria ao ADC se o SCT-013 estivesse acoplado a um transformador real. As VSINEs geram esse sinal sintético. O TR1 no esquemático existe apenas como ilustração conceitual — não há nada para "medir" nele dentro do Proteus.

**No hardware físico (ESP32):** o SCT-013 real será fisicamente acoplado aos fios do transformador real. O sinal real chega ao ADC do ESP32. O firmware é exatamente o mesmo — só a origem do sinal muda.

---

## 2. DS18B20 retorna -127 ou NaN intermitentemente

**Sintoma:** `getDeviceCount()` retorna 1 (sensor detectado), mas `getTempCByIndex(0)` retorna -127 (DEVICE_DISCONNECTED) na maioria das chamadas. O Virtual Terminal mostra leituras corretas esporadicamente, intercaladas com erros.

**Causa raiz:** o modelo do DS18B20 do Proteus vem com timings padrão do protocolo OneWire **incompatíveis** com a biblioteca `DallasTemperature` moderna.

**Solução:** ajustar as propriedades do modelo dentro do Proteus (não no código). Clique duplo no componente DS18B20 e configure:

| Propriedade | Valor |
|---|---|
| Data Pulse Delay High | 40µs |
| Data Pulse Delay Low | 140µs |
| Time Reset Low | 400µs |
| Time Slot | 120µs |
| Conversion Time | 10ms |
| Data Write Time | 1ms |

Após esse ajuste, o sensor responde rápido e corretamente, **eliminando a necessidade de qualquer `delay()` no firmware**.

**No hardware físico (ESP32):** o sensor real respeita os tempos do datasheet automaticamente. Esses ajustes não se aplicam — são exclusivos do modelo simulado.

---

## 3. MPU6050 trava o eixo X em -1.00g no estado parado

**Sintoma:** com Roll=0, Pitch=0, Yaw=0 no controle do MPU6050, o acelerômetro reporta `Acel X: -1.00 Y:0.00 Z:0.00`. O esperado seria `X:0, Y:0, Z:1`.

**Causa:** bug conhecido do modelo `.dll` da biblioteca ElectronicTree. As convenções de eixos estão trocadas internamente.

**Como conviver com isso:** 

- **Não tente "consertar"** no código — o problema é no modelo, não no firmware
- A FFT analisa **variação** do sinal, não valor absoluto em repouso, então o bug não impacta o diagnóstico de vibração
- No hardware físico, o sensor real reporta os eixos corretos

**O que SE espera funcionar na simulação:** mudar Roll/Pitch/Yaw deve fazer os valores mudarem. Se mudar e os valores ficarem estáticos, aí sim tem problema (provavelmente I²C — confira SDA/SCL/AD0).

---

## 4. Aviso "Logic contention(s) detected" no Simulation Log

**Sintoma:** durante a simulação, o Proteus emite avisos como `Logic contention(s) detected on net #00004`.

**Causa:** comportamento normal do protocolo **OneWire** (DS18B20). O protocolo opera no modelo "wired-AND" onde o pull-up de 4.7kΩ mantém HIGH e o sensor/master puxa LOW quando precisa transmitir. Para o Proteus, isso parece "dois dispositivos brigando no mesmo fio".

**O que fazer:** **ignorar.** Não tente desconectar o pull-up, não tente mudar para outro pino. É falso positivo do simulador.

---

## 5. SCT-013 não existe no Proteus

**Sintoma:** ao tentar adicionar o sensor de corrente real, você não encontra o componente na biblioteca.

**Causa:** o SCT-013 é um sensor especializado que não tem modelo no Proteus.

**Solução adotada:** ver item 1 — simular o sinal já condicionado com VSINE + circuito de condicionamento. Detalhes no `README.md` na seção "Como o Transformador é Simulado".

---

## 6. Proteus não simula WiFi nem MQTT

**Sintoma:** seu primeiro impulso é fazer o Arduino UNO se conectar ao broker Mosquitto pra testar MQTT na simulação. Não funciona.

**Causa:** o Proteus não tem stack TCP/IP nem modelo de adaptador WiFi.

**Solução adotada:** o firmware usa `publicador::publicar()`, uma camada abstrata que:
- **No Arduino UNO:** imprime no Serial em formato `[MQTT] tópico -> {JSON}`
- **No ESP32:** publica de fato no broker via PubSubClient

O script `tools/serial_bridge/bridge.py` lê o Serial do Proteus via porta COM virtual (com0com no Windows, socat no Linux) e republica no broker real. Detalhes em [`03-mqtt.md`](./03-mqtt.md) e [`01-setup.md`](./01-setup.md).

---

## 7. Múltiplos DS18B20 no esquemático colidem

**Sintoma:** você adiciona mais um DS18B20 ao circuito e o `getDeviceCount()` continua retornando 1. As leituras ficam instáveis.

**Causa:** todos os DS18B20 do Proteus vêm com o mesmo ROM address por padrão (algo como `00 00 00 00 00 00 00 00`). No protocolo OneWire, cada sensor precisa ter endereço único. Com endereços iguais, eles colidem no barramento.

**Solução (se realmente precisar de múltiplos):** clique duplo em cada sensor e edite a propriedade `ROM` para valores únicos (ex.: `28 11 22 33 44 55 66 77`).

**No nosso projeto:** só um DS18B20 é necessário (monitorando o núcleo). Se você adicionou extras "pra testar", remova — só atrapalham.

---

## 8. Timestamp do `millis()` é o uptime do Arduino, não Unix time

**Sintoma:** os payloads MQTT publicados no Proteus têm `"ts": 2, "ts": 4, "ts": 6...` em vez de timestamps Unix reais.

**Causa:** o Arduino UNO não tem RTC. O `millis()` retorna milissegundos desde o boot. Dividimos por 1000 para ter segundos desde o boot.

**Solução adotada:** a ponte `tools/serial_bridge/bridge.py` reescreve o `ts` para o timestamp Unix da máquina antes de publicar no broker. O firmware do ESP32, quando finalizado, vai sincronizar via NTP e publicar timestamps Unix corretos diretamente.

---

## 9. Virtual Terminal não abre, ou abre vazio

**Sintoma:** rodou a simulação, tudo deveria estar funcionando, mas o Virtual Terminal não mostra nada.

**Checklist rápido:**

1. O fio do Virtual Terminal RXD está conectado ao pino **PD1/TXD** do Arduino (pino 1)? **Não no PD0/RXD** (pino 0) — esse é entrada, não saída.
2. O baud rate do Virtual Terminal (propriedade) está em **9600**, igual ao `Serial.begin(9600)` no código?
3. A janela do Virtual Terminal pode estar minimizada ou atrás da janela principal do Proteus. Clique duplo no componente durante a simulação para reabrir.
4. Você carregou o `.hex` correto no Arduino? Clique duplo no Arduino UNO → campo Program File.

---

## 10. Mudar o Virtual Terminal não altera a aparência (cor, fonte)

**Sintoma:** quer melhorar a legibilidade do Virtual Terminal e descobre que não tem opção nenhuma de customização.

**Causa:** o Virtual Terminal é um componente intencionalmente minimalista. Sem fonte customizável, sem cor, sem zoom.

**Soluções:**

- Para apresentação: tirar screenshot mesmo em fonte pequena (o conteúdo é o que importa)
- Para uso prolongado: usar componente **COMPIM** para mapear a serial do Arduino para uma porta COM real do Windows, e abrir um terminal externo (PuTTY, Termite, ou Serial Monitor do Arduino IDE)
- Para demos profissionais: combinar COMPIM + a ponte Serial→MQTT + dashboard `supervision/`

---

## 11. FFT e Inrush no Proteus são validações funcionais, não metrológicas

**Sintoma:** os tópicos `transformador/vibracao/fft_120hz`, `transformador/vibracao/fft_240hz`, `transformador/vibracao/espectro` e `transformador/primario/inrush` aparecem no Virtual Terminal, mas os valores não correspondem a uma medição física calibrada em g/A.

**Causa:** o MPU6050 do Proteus é um modelo simplificado e o SCT-013 não existe no simulador. O firmware analisa o sinal disponível, mas o sinal de corrente é uma VSINE condicionada e o sinal de vibração depende do modelo ElectronicTree.

**Solução:** usar a simulação para validar fluxo de dados, tópicos MQTT, máquina de estados e integração com a IHM. Para calibração final de limiares, usar o hardware ESP32 com SCT-013 real e MPU6050 fixado no chassi.

**No hardware físico:** após calibrar o SCT-013, `inrush` deve representar corrente real em A. No Proteus, o tópico usa `Vpico` porque mede o pico do sinal condicionado no ADC.

---

## 12. COMPIM liga TXD do Arduino ao **TXD do COMPIM**

**Sintoma:** ponte serial→MQTT abre `COM5` sem erro, mas `readline()` sempre retorna vazio. Virtual Terminal do Proteus mostra os payloads normalmente — então o firmware está OK.

**Causa:** os pinos do COMPIM são "ponte para o host", não terminais convencionais. O **TXD do COMPIM** funciona como entrada vinda do circuito simulado — é ele que recebe os bytes para repassar pro `Physical port` do Windows. Conectar TXD do Arduino ao RXD do COMPIM faz tudo cair no vazio.

**Solução:** ligar **TXD do Arduino (D1/PD1) → TXD do COMPIM**. RXD do COMPIM pode ficar solto, porque o firmware não lê comandos pela serial.

**Como descobrimos:** os layouts do COMPIM no datasheet do Proteus desenham os pinos da perspectiva do host (a porta COM física), não do circuito simulado.

---

## 13. com0com no Windows 11 não instala com Secure Boot ativo

**Sintoma:** instala o com0com, reinicia, abre o Device Manager — não há nenhuma porta `COM4`/`COM5` na seção `com0com - serial port emulators`. Nenhum erro óbvio durante a instalação.

**Causa:** o driver da com0com é assinado por entidade não-Microsoft. O Secure Boot do Windows 11 rejeita drivers de kernel sem assinatura da MS por padrão.

**Solução:** entrar na UEFI (geralmente reiniciar segurando `F2`/`Del` conforme placa), desativar `Secure Boot`, salvar, reiniciar. Reinstalar a com0com — as portas aparecem.

**Considere reativar Secure Boot depois?** Pode reativar — uma vez instalado, o driver continua funcional. Mas se um Windows Update reinstalar o driver, o problema volta. Manter desativado durante o desenvolvimento é mais simples.

---

## Como adicionar uma pegadinha nova

Se você descobrir um comportamento estranho do Proteus, **documente aqui**. Estrutura sugerida:

```markdown
## N. Nome curto do problema

**Sintoma:** o que acontece visualmente / como o problema se manifesta

**Causa:** explicação técnica do porquê

**Solução:** o que fazer (ou "ignorar" se for falso positivo)

**No hardware físico:** o que muda na realidade (se aplicável)
```

Cada item bem documentado aqui economiza horas de outro integrante.
