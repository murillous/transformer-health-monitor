/**
 * @file    main.cpp
 * @brief   Sistema de diagnóstico de saúde de transformadores — orquestração.
 *
 * Este arquivo só amarra os módulos. A lógica de cada sensor está em seu
 * próprio par .h/.cpp para facilitar manutenção e testes.
 */

#include <Arduino.h>
#include <Wire.h>

#include "config.h"
#include "publicador.h"
#include "mpu6050.h"
#include "ds18b20.h"
#include "sct013.h"

static unsigned long ultimaLeituraMs = 0;

// ═══════════════════════════════════════════════════════════════════════════
void setup()
{
    Serial.begin(9600);
    Wire.begin();
    delay(200);

    Serial.println(F("==================================="));
    Serial.println(F("   DIAGNOSTICO DE TRANSFORMADOR    "));
    Serial.println(F("==================================="));

    publicador::iniciar();

    Serial.print(F("[MPU6050] "));
    Serial.println(mpu6050::iniciar() ? F("OK") : F("FALHA"));

    Serial.print(F("[DS18B20] Sensores detectados: "));
    Serial.println(ds18b20::iniciar());

    Serial.println(F("[SCT-013] A0=primario  A1=secundario"));
    Serial.println(F("-----------------------------------"));
}

// ═══════════════════════════════════════════════════════════════════════════
void loop()
{
    publicador::manter();

    if (millis() - ultimaLeituraMs < INTERVALO_MS) return;
    ultimaLeituraMs = millis();

    // Aquisição
    const mpu6050::Leitura mpu  = mpu6050::ler();
    const float            temp = ds18b20::lerTemperatura();
    const float            rmsP = sct013::lerRMS(PINO_SCT_P);
    const float            rmsS = sct013::lerRMS(PINO_SCT_S);

    // Publicação
    publicador::publicar(TOPICO_CORR_PRIM,   rmsP, "Vrms");
    publicador::publicar(TOPICO_CORR_SEC,    rmsS, "Vrms");
    publicador::publicar(TOPICO_VIBRACAO,    mpu.az, "g");
    publicador::publicar(TOPICO_TEMP_NUCLEO, temp, "C");

    Serial.println(F("-----------------------------------"));
}