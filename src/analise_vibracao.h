/**
 * @file    analise_vibracao.h
 * @brief   Amostragem incremental e FFT da vibracao do MPU6050.
 */

#pragma once

#include <Arduino.h>

namespace analise_vibracao {

struct Espectro {
    bool  novo;
    float fft_120hz;
    float fft_240hz;
};

/**
 * @brief Inicializa buffers e temporizacao da analise vibracional.
 */
void iniciar();

/**
 * @brief Coleta amostras sem usar delay() e calcula FFT quando o buffer fecha.
 */
Espectro atualizar();

} // namespace analise_vibracao
