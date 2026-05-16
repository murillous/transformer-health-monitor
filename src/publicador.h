/**
 * @file    publicador.h
 * @brief   Camada de transporte abstrata — Serial (Proteus) ou MQTT (ESP32).
 *
 * Mesma interface nos dois ambientes. O código de aplicação chama
 * publicar() sem saber para onde os dados estão indo de fato.
 */

#pragma once

#include <Arduino.h>

namespace publicador {

/**
 * @brief Inicializa o subsistema de publicação.
 *
 * No Arduino: garante que Serial.begin() foi chamado.
 * No ESP32: conecta no WiFi e no broker MQTT.
 */
void iniciar();

/**
 * @brief Publica um valor numérico em um tópico.
 *
 * @param topico    String hierárquica (ex.: "transformador/nucleo/temperatura")
 * @param valor     Valor numérico em ponto flutuante
 * @param unidade   Sufixo descritivo (ex.: "C", "Vrms", "g")
 */
void publicar(const char* topico, float valor, const char* unidade);

/**
 * @brief Mantém a conexão MQTT viva (só no ESP32).
 *
 * Deve ser chamada no loop() para reconexões automáticas.
 * No Arduino é no-op.
 */
void manter();

} // namespace publicador