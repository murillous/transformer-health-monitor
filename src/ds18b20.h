/**
 * @file    ds18b20.h
 * @brief   Sensor de temperatura DS18B20 via OneWire.
 */

#pragma once

#include <Arduino.h>

namespace ds18b20 {

/**
 * @brief Inicializa o sensor.
 * @return Quantidade de sensores detectados no barramento.
 */
uint8_t iniciar();

/**
 * @brief Lê a temperatura com cache de última leitura válida.
 *
 * Tolera falhas intermitentes do modelo do Proteus mantendo
 * o último valor bom até que uma nova leitura válida chegue.
 *
 * @return Temperatura em °C, ou NAN se nunca houve leitura válida.
 */
float lerTemperatura();

} // namespace ds18b20