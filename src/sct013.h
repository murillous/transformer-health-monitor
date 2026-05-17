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

} // namespace sct013
