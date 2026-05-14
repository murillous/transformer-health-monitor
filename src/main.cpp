/**
 * @file main.cpp
 * @brief Sistema de diagnóstico de saúde de transformadores — simulação Proteus
 *
 * Monitora quatro grandezas do transformador em tempo real:
 *   - Vibração mecânica via acelerômetro MPU6050 (I2C)
 *   - Temperatura do núcleo via DS18B20 (OneWire)
 *   - Corrente do enrolamento primário via SCT-013 simulado (ADC A0)
 *   - Corrente do enrolamento secundário via SCT-013 simulado (ADC A1)
 *
 * @note Código de simulação para Arduino UNO R3 no Proteus.
 *       No hardware físico (ESP32), ajustar VREF para 3.3V,
 *       ADC_RESOLUCAO para 4095.0 e remover os delay() do DS18B20.
 *
 * @hardware
 *   MPU6050  → SDA:A4  SCL:A5  AD0:GND
 *   DS18B20  → DQ:D4   pull-up 4.7kΩ entre DQ e 5V
 *   SCT-013P → A0      (VSINE 60Hz 1.0V + divisor 10k+10k + cap 10µF)
 *   SCT-013S → A1      (VSINE 60Hz 0.5V + divisor 10k+10k + cap 10µF)
 */

#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ── Pinos ─────────────────────────────────────────────────────────────────────

#define PINO_DS18B20  4    ///< Pino OneWire do DS18B20 (DQ)
#define PINO_SCT_P    A0   ///< ADC — SCT-013 enrolamento primário
#define PINO_SCT_S    A1   ///< ADC — SCT-013 enrolamento secundário

// ── Endereços e registradores MPU6050 ─────────────────────────────────────────

#define MPU_ADDR         0x68  ///< Endereço I2C com AD0 em GND
#define MPU_REG_PWR      0x6B  ///< Power Management 1 — controla modo sleep
#define MPU_REG_WHO_AM_I 0x75  ///< Identidade do chip — sempre retorna 0x68
#define MPU_REG_ACCEL_X  0x3B  ///< Primeiro registrador do acelerômetro (High byte X)
#define MPU_REG_GYRO_X   0x43  ///< Primeiro registrador do giroscópio (High byte X)

/**
 * @defgroup calibracao Calibração do ADC
 * Parâmetros específicos para Arduino UNO (5V, 10 bits).
 * Alterar para ESP32: VREF=3.3, ADC_RESOLUCAO=4095.0
 * @{
 */
#define VREF           5.0    ///< Tensão de referência do ADC [V]
#define ADC_RESOLUCAO  1023.0 ///< Fundo de escala do ADC (2^10 - 1)
#define BIAS           2.5    ///< Tensão de offset gerada pelo divisor 10k+10k [V]
/// @}

// ── Parâmetros de amostragem RMS ──────────────────────────────────────────────

/**
 * Número de amostras por cálculo RMS.
 * Com delayMicroseconds(200) entre amostras, a taxa efetiva é ~5 kHz —
 * acima do mínimo de Nyquist (120 Hz) com margem ampla.
 */
#define N_AMOSTRAS  200

// ── Intervalo de publicação serial ────────────────────────────────────────────

#define INTERVALO_MS  2000UL  ///< Período entre leituras no loop [ms]

// ── Instâncias dos sensores ───────────────────────────────────────────────────

OneWire           oneWire(PINO_DS18B20);
DallasTemperature ds18b20(&oneWire);

// ── Estado do loop não-bloqueante ─────────────────────────────────────────────

static unsigned long ultimaLeitura = 0;

// ══════════════════════════════════════════════════════════════════════════════
// Funções auxiliares
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @brief Lê dois bytes consecutivos de um registrador do MPU6050 via I2C.
 *
 * O MPU6050 armazena cada grandeza em dois registradores de 8 bits (High e Low).
 * Esta função realiza uma leitura combinada e retorna o valor como inteiro de 16 bits
 * com sinal, preservando corretamente valores negativos (complemento de dois).
 *
 * @param reg Endereço do registrador High byte (ex: 0x3B para aceleração X)
 * @return Valor bruto de 16 bits com sinal
 */
int16_t lerRegistrador16(uint8_t reg)
{
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);       // repeated start: mantém barramento ocupado
  Wire.requestFrom(MPU_ADDR, 2);
  return (Wire.read() << 8) | Wire.read();
}

/**
 * @brief Calcula a tensão RMS de um sinal AC no pino analógico especificado.
 *
 * O sinal do SCT-013 condicionado chega ao ADC centrado em BIAS (2.5V).
 * Subtraindo o offset, obtém-se apenas o componente AC. O RMS é calculado
 * pela definição: raiz da média dos quadrados das amostras.
 *
 * Relação esperada para sinal senoidal puro:
 *   V_rms = V_amplitude / sqrt(2)
 *   Primário  (1.0V amplitude) → ~0.707 V_rms
 *   Secundário (0.5V amplitude) → ~0.354 V_rms
 *
 * @param pino Pino analógico de entrada (PINO_SCT_P ou PINO_SCT_S)
 * @return Tensão RMS calculada [V]
 */
float calcularRMS(uint8_t pino)
{
  float somatorio = 0.0;

  for (int i = 0; i < N_AMOSTRAS; i++)
  {
    // Converte leitura ADC para tensão e remove o offset DC do divisor
    float tensao = (analogRead(pino) * VREF / ADC_RESOLUCAO) - BIAS;
    somatorio += tensao * tensao;

    // Aguarda entre amostras para garantir cobertura do ciclo de 60Hz.
    // 200µs → ~5000 amostras/s → resolve até 2500Hz (Nyquist)
    delayMicroseconds(200);
  }

  return sqrt(somatorio / N_AMOSTRAS);
}

/**
 * @brief Lê a temperatura do DS18B20 com espera explícita compatível com Proteus.
 *
 * No Proteus, setWaitForConversion() é insuficiente — o delay() garante que
 * a conversão esteja completa antes da leitura. No hardware físico com ESP32,
 * substituir por leitura assíncrona com millis() e remover o delay().
 *
 * @return Temperatura em graus Celsius, ou NAN em caso de falha.
 */
float lerTemperatura()
{
  ds18b20.requestTemperatures();
  delay(100);  // NOTE: necessário no Proteus; remover no ESP32 físico

  float temp = ds18b20.getTempCByIndex(0);

  // Filtra valores inválidos conhecidos do protocolo OneWire
  if (temp == DEVICE_DISCONNECTED_C || temp == 85.0 || temp < -55.0)
    return NAN;

  return temp;
}

// ══════════════════════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════════════════════

void setup()
{
  Serial.begin(9600);
  Wire.begin();
  delay(200);  // aguarda estabilização das alimentações na simulação

  Serial.println(F("==================================="));
  Serial.println(F("   DIAGNOSTICO - PROTEUS           "));
  Serial.println(F("==================================="));

  // ── Inicialização do MPU6050 ────────────────────────────────────────────────

  // Retira o chip do modo sleep (bit 6 do PWR_MGMT_1 = 0)
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(MPU_REG_PWR);
  Wire.write(0x00);
  Wire.endTransmission();
  delay(100);

  // Verifica identidade do chip antes de prosseguir
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(MPU_REG_WHO_AM_I);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 1);

  Serial.print(F("[MPU6050] WHO_AM_I: "));
  if (Wire.available())
  {
    uint8_t id = Wire.read();
    Serial.print(F("0x"));
    Serial.print(id, HEX);
    Serial.println(id == MPU_ADDR ? F(" --> OK") : F(" --> ERRO (esperado 0x68)"));
  }
  else
  {
    Serial.println(F("sem resposta -- cheque SDA/SCL e AD0->GND"));
  }

  // ── Inicialização do DS18B20 ────────────────────────────────────────────────

  ds18b20.begin();
  ds18b20.setResolution(9);           // 9 bits: resolução 0.5°C, conversão ~93ms
  ds18b20.setWaitForConversion(true); // bloqueia até conversão terminar

  Serial.print(F("[DS18B20] Sensores: "));
  Serial.println(ds18b20.getDeviceCount());

  // Leitura inicial para confirmar funcionamento
  float tempInicial = lerTemperatura();
  Serial.print(F("[DS18B20] Temp. inicial: "));
  if (isnan(tempInicial))
    Serial.println(F("falha -- cheque DQ->D4 e pull-up 4.7k"));
  else
  {
    Serial.print(tempInicial, 1);
    Serial.println(F(" C"));
  }

  // ── SCT-013 ─────────────────────────────────────────────────────────────────

  Serial.println(F("[SCT-013] A0=primario  A1=secundario -- OK"));

  Serial.println(F("-----------------------------------"));
  Serial.println(F("Leituras a cada 2s"));
  Serial.println(F("-----------------------------------"));
}

// ══════════════════════════════════════════════════════════════════════════════
// Loop principal — não-bloqueante via millis()
// ══════════════════════════════════════════════════════════════════════════════

void loop()
{
  // Controle de tempo sem delay() — libera o processador entre leituras
  if (millis() - ultimaLeitura < INTERVALO_MS)
    return;
  ultimaLeitura = millis();

  // ── Acelerômetro (±2g, 16384 LSB/g) ────────────────────────────────────────

  int16_t ax = lerRegistrador16(MPU_REG_ACCEL_X);
  int16_t ay = lerRegistrador16(MPU_REG_ACCEL_X + 2);
  int16_t az = lerRegistrador16(MPU_REG_ACCEL_X + 4);

  Serial.print(F("Acel (g)   X:"));  Serial.print(ax / 16384.0, 2);
  Serial.print(F("  Y:"));           Serial.print(ay / 16384.0, 2);
  Serial.print(F("  Z:"));           Serial.println(az / 16384.0, 2);

  // ── Giroscópio (±250°/s, 131 LSB por °/s) ──────────────────────────────────

  int16_t gx = lerRegistrador16(MPU_REG_GYRO_X);
  int16_t gy = lerRegistrador16(MPU_REG_GYRO_X + 2);
  int16_t gz = lerRegistrador16(MPU_REG_GYRO_X + 4);

  Serial.print(F("Giro (g/s) X:"));  Serial.print(gx / 131.0, 1);
  Serial.print(F("  Y:"));           Serial.print(gy / 131.0, 1);
  Serial.print(F("  Z:"));           Serial.println(gz / 131.0, 1);

  // ── Temperatura do núcleo ───────────────────────────────────────────────────

  float temp = lerTemperatura();
  Serial.print(F("Temp (C):  "));
  isnan(temp) ? Serial.println(F("erro")) : Serial.println(temp, 1);

  // ── Corrente via SCT-013 (valores em Vrms no ADC) ──────────────────────────

  float rmsP = calcularRMS(PINO_SCT_P);
  Serial.print(F("SCT Prim (Vrms): "));
  Serial.println(rmsP, 4);

  float rmsS = calcularRMS(PINO_SCT_S);
  Serial.print(F("SCT Sec  (Vrms): "));
  Serial.println(rmsS, 4);

  Serial.println(F("-----------------------------------"));
}