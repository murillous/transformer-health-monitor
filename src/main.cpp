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
#include "diagnostico.h"
#include "analise_vibracao.h"

static unsigned long ultimaLeituraMs = 0;
static float ultimaFft120Hz = NAN;
static float ultimaFft240Hz = NAN;

// ═══════════════════════════════════════════════════════════════════════════
void setup()
{
    Serial.begin(9600);
    Wire.begin();

    Serial.println(F("==================================="));
    Serial.println(F("   DIAGNOSTICO DE TRANSFORMADOR    "));
    Serial.println(F("==================================="));

    publicador::iniciar();

    Serial.print(F("[MPU6050] "));
    Serial.println(mpu6050::iniciar() ? F("OK") : F("FALHA"));

    Serial.print(F("[DS18B20] Sensores detectados: "));
    Serial.println(ds18b20::iniciar());

    Serial.println(F("[SCT-013] A0=primario  A1=secundario"));
    analise_vibracao::iniciar();
    Serial.println(F("-----------------------------------"));
}

// ═══════════════════════════════════════════════════════════════════════════
void loop()
{
    publicador::manter();

    const analise_vibracao::Espectro espectro = analise_vibracao::atualizar();
    if (espectro.novo) {
        ultimaFft120Hz = espectro.fft_120hz;
        ultimaFft240Hz = espectro.fft_240hz;
        publicador::publicar(TOPICO_FFT_120HZ, ultimaFft120Hz, "g");
        publicador::publicar(TOPICO_FFT_240HZ, ultimaFft240Hz, "g");
        publicador::publicarEspectro(TOPICO_ESPECTRO,
                                     analise_vibracao::magnitudes(),
                                     analise_vibracao::numAmostras(),
                                     analise_vibracao::frequenciaAmostragemHz());
    }

    const diagnostico::Inrush inrush =
        diagnostico::atualizarInrush(sct013::lerInstantaneoAbs(PINO_SCT_P));
    if (inrush.detectado) {
        publicador::publicar(TOPICO_INRUSH, inrush.pico, "Vpico");
        diagnostico::publicarAlarmes(NAN, NAN, NAN, inrush);
    }

    if (millis() - ultimaLeituraMs < INTERVALO_MS) return;
    ultimaLeituraMs = millis();

    // Aquisição
    const mpu6050::Leitura mpu  = mpu6050::ler();
    const float            temp   = ds18b20::lerTemperatura();
    const float            rmsP   = sct013::lerRMS(PINO_SCT_P);
    const float            rmsS   = sct013::lerRMS(PINO_SCT_S);
    const float            deltaT = diagnostico::calcularDeltaT(temp);

    // Publicação
    publicador::publicar(TOPICO_CORR_PRIM,   rmsP, "Vrms");
    publicador::publicar(TOPICO_CORR_SEC,    rmsS, "Vrms");
    publicador::publicar(TOPICO_VIBRACAO,    mpu.az, "g");
    publicador::publicar(TOPICO_TEMP_NUCLEO, temp, "C");
    publicador::publicar(TOPICO_DELTA_T,     deltaT, "C");

    diagnostico::publicarAlarmes(temp, deltaT, ultimaFft120Hz, {false, 0.0f});

    publicador::publicar(TOPICO_HEARTBEAT, (float)(millis() / 1000UL), "s");

    Serial.println(F("-----------------------------------"));
}
