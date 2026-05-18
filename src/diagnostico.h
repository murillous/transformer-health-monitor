/**
 * @file    diagnostico.h
 * @brief   Regras de diagnostico, delta T e deteccao de inrush.
 */

#pragma once

#include <Arduino.h>

namespace diagnostico {

struct Inrush {
    bool  detectado;
    float pico;
};

/**
 * @brief Calcula gradiente termico contra temperatura ambiente configurada.
 */
float calcularDeltaT(float temperatura_nucleo);

/**
 * @brief Atualiza maquina de estados de inrush com uma amostra do primario.
 *
 * @return Evento novo de inrush quando uma janela de captura termina.
 */
Inrush atualizarInrush(float corrente_primario_vpico);

/**
 * @brief Publica alarmes estruturados para leituras fora dos limites.
 */
void publicarAlarmes(float temperatura_nucleo, float delta_t,
                     float fft_120hz, const Inrush& inrush);

} // namespace diagnostico
