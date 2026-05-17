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
 * @brief Publica um alarme estruturado no topico de status.
 *
 * @param tipo        Identificador do alarme.
 * @param severidade  Nivel do alarme (warning, critical).
 * @param valor       Valor que disparou o alarme.
 * @param limite      Limite configurado.
 * @param mensagem    Mensagem curta para a IHM.
 */
void publicarAlarme(const char* tipo, const char* severidade,
                    float valor, float limite, const char* mensagem);

/**
 * @brief Publica espectro de FFT como array de pares {freq, amplitude}.
 *
 * @param topico       Topico MQTT de destino.
 * @param freqs        Vetor de frequencias (Hz inteiros) a publicar.
 * @param amplitudes   Vetor paralelo com a amplitude de cada frequencia.
 * @param n_bins       Numero de pares (tamanho dos dois vetores).
 */
void publicarEspectro(const char* topico, const int* freqs,
                      const float* amplitudes, uint16_t n_bins);

/**
 * @brief Publica burst de amostras (forma de onda) como JSON.
 *
 * Payload: {"ts":...,"amostras":[a0,a1,...,a_{n-1}]}.
 *
 * @param topico    Topico MQTT.
 * @param amostras  Vetor de amostras (em volts ja com bias removido).
 * @param n         Numero de amostras.
 */
void publicarOnda(const char* topico, const float* amostras, uint16_t n);

/**
 * @brief Mantém a conexão MQTT viva (só no ESP32).
 *
 * Deve ser chamada no loop() para reconexões automáticas.
 * No Arduino é no-op.
 */
void manter();

} // namespace publicador
