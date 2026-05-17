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

/**
 * @brief Vetor de magnitudes do ultimo FFT (valido apos Espectro::novo=true).
 *        Tamanho = numAmostras() / 2. Indice 0 = DC.
 */
const float* magnitudes();
uint16_t      numAmostras();
float         frequenciaAmostragemHz();

} // namespace analise_vibracao
