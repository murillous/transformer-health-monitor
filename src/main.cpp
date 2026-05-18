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
static bool  espectroDisponivel = false;

static const int FREQS_HARMONICAS[] = {120, 240, 360, 480, 600};
static constexpr uint16_t N_HARMONICAS =
    sizeof(FREQS_HARMONICAS) / sizeof(FREQS_HARMONICAS[0]);

// Snapshot das amplitudes capturado logo após o FFT terminar — evita ler
// v_real depois que atualizar() sobrescreveu os bins com novas amostras.
static float ampsHarmonicas[N_HARMONICAS] = {NAN, NAN, NAN, NAN, NAN};

// Buffer de forma de onda global static (128 bytes). Mover pra fora do
// loop() reduz pressao no stack do AVR — no caminho de inrush + alarme o
// stack chega perto do limite (RAM 2KB total).
static float ondaBuf[N_AMOSTRAS_ONDA];

// ═══════════════════════════════════════════════════════════════════════════
void setup()
{
    Serial.begin(BAUD_SERIAL);
    Wire.begin();

    publicador::iniciar();
    mpu6050::iniciar();
    ds18b20::iniciar();
    analise_vibracao::iniciar();
    // Banner removido: bridge espera apenas linhas "[MQTT] ...". Use Virtual
    // Terminal pra diagnóstico de inicialização caso precise; o log foi tirado
    // do Serial pra reduzir ruído na ponte e economizar banda a 9600 baud.
}

// ═══════════════════════════════════════════════════════════════════════════
void loop()
{
    publicador::manter();

    const analise_vibracao::Espectro espectro = analise_vibracao::atualizar();
    if (espectro.novo) {
        // Capturar amplitudes AGORA enquanto v_real ainda tem magnitudes —
        // a próxima chamada de atualizar() vai sobrescrever esses bins com
        // novas amostras brutas do MPU6050.
        for (uint16_t i = 0; i < N_HARMONICAS; i++) {
            ampsHarmonicas[i] = analise_vibracao::amplitudeEmFreq((float)FREQS_HARMONICAS[i]);
        }
        espectroDisponivel = true;
        // publicação acontece no tick lento abaixo — evita saturar Serial
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

    if (espectroDisponivel) {
        publicador::publicar(TOPICO_FFT_120HZ, ampsHarmonicas[0], "g");
        publicador::publicar(TOPICO_FFT_240HZ, ampsHarmonicas[1], "g");
        publicador::publicarEspectro(TOPICO_ESPECTRO, FREQS_HARMONICAS, ampsHarmonicas, N_HARMONICAS);
    }

    // Forma de onda dos dois lados — captura burst + publica array.
    // ondaBuf e global static (declarado no topo) pra nao ocupar stack.
    sct013::capturarOnda(PINO_SCT_P, ondaBuf, N_AMOSTRAS_ONDA, PERIODO_ONDA_US);
    publicador::publicarOnda(TOPICO_ONDA_P, ondaBuf, N_AMOSTRAS_ONDA);
    sct013::capturarOnda(PINO_SCT_S, ondaBuf, N_AMOSTRAS_ONDA, PERIODO_ONDA_US);
    publicador::publicarOnda(TOPICO_ONDA_S, ondaBuf, N_AMOSTRAS_ONDA);

    diagnostico::publicarAlarmes(temp, deltaT, ampsHarmonicas[0], {false, 0.0f});

    publicador::publicar(TOPICO_HEARTBEAT, (float)(millis() / 1000UL), "s");
}
