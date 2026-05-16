/**
 * @file    config.h
 * @brief   Constantes globais do projeto — pinos, calibração e parâmetros.
 *
 * Centraliza tudo que muda entre plataformas (Arduino UNO vs ESP32) e
 * tudo que pode ser ajustado sem recompilar lógica.
 */

#pragma once

#include <Arduino.h>

// ═══════════════════════════════════════════════════════════════════════════
// Detecção de plataforma — define automaticamente os parâmetros corretos
// ═══════════════════════════════════════════════════════════════════════════

#if defined(ESP32)
    // ─── Hardware físico ─────────────────────────────────────────────────
    constexpr uint8_t PINO_DS18B20 = 4;     // GPIO4
    constexpr uint8_t PINO_SCT_P   = 34;    // GPIO34 (ADC1_CH6)
    constexpr uint8_t PINO_SCT_S   = 35;    // GPIO35 (ADC1_CH7)
    constexpr float   VREF         = 3.3f;
    constexpr float   ADC_RES      = 4095.0f;
    constexpr float   BIAS         = 1.65f;
#else
    // ─── Simulação Proteus (Arduino UNO) ─────────────────────────────────
    constexpr uint8_t PINO_DS18B20 = 4;
    constexpr uint8_t PINO_SCT_P   = A0;
    constexpr uint8_t PINO_SCT_S   = A1;
    constexpr float   VREF         = 5.0f;
    constexpr float   ADC_RES      = 1023.0f;
    constexpr float   BIAS         = 2.5f;
#endif

// ═══════════════════════════════════════════════════════════════════════════
// Parâmetros de aquisição
// ═══════════════════════════════════════════════════════════════════════════

constexpr int           N_AMOSTRAS_RMS = 200;
constexpr unsigned long INTERVALO_MS   = 2000UL;

// ═══════════════════════════════════════════════════════════════════════════
// Tópicos MQTT — mesma string usada no Proteus (Serial) e no ESP32 (broker)
// ═══════════════════════════════════════════════════════════════════════════

constexpr const char* TOPICO_TEMP_NUCLEO = "transformador/nucleo/temperatura";
constexpr const char* TOPICO_CORR_PRIM   = "transformador/primario/corrente";
constexpr const char* TOPICO_CORR_SEC    = "transformador/secundario/corrente";
constexpr const char* TOPICO_VIBRACAO    = "transformador/vibracao/aceleracao";
constexpr const char* TOPICO_ALARME      = "transformador/status/alarme";