/**
 * @file    sct013.h
 * @brief   Sensor de corrente SCT-013 — cálculo RMS via ADC.
 */

#pragma once

#include <Arduino.h>

namespace sct013 {

/**
 * @brief Calcula tensão RMS no pino analógico especificado.
 *
 * Subtrai o offset DC do bias (2,5V no Arduino, 1,65V no ESP32) e
 * calcula a média quadrática sobre N_AMOSTRAS_RMS amostras.
 *
 * @return Tensão RMS em volts.
 */
float lerRMS(uint8_t pino);

/**
 * @brief Le uma amostra instantanea absoluta do sinal AC no pino.
 *
 * Remove o bias DC e retorna o modulo da tensao. Usado para detectar picos
 * rapidos de inrush sem esperar a janela RMS periodica.
 */
float lerInstantaneoAbs(uint8_t pino);

/**
 * @brief Captura um burst de amostras (tensao com bias removido) no pino.
 *
 * Bloqueia por aprox n * periodo_us. Usado para enviar a forma de onda
 * ao dashboard. Chamar apenas no tick lento — bloqueia o loop principal.
 *
 * @param pino       Pino analogico.
 * @param out        Vetor de saida (tamanho n).
 * @param n          Numero de amostras.
 * @param periodo_us Intervalo entre amostras em microssegundos.
 */
void capturarOnda(uint8_t pino, float* out, uint16_t n, uint16_t periodo_us);

} // namespace sct013
