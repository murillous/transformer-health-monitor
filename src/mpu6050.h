/**
 * @file    mpu6050.h
 * @brief   Acelerômetro/giroscópio MPU6050 via I²C.
 */

#pragma once

#include <Arduino.h>

namespace mpu6050 {

struct Leitura {
    float ax, ay, az;   ///< Aceleração em g
    float gx, gy, gz;   ///< Velocidade angular em °/s
};

/**
 * @brief Inicializa o sensor e verifica sua identidade.
 * @return true se o sensor respondeu corretamente.
 */
bool iniciar();

/**
 * @brief Lê todas as grandezas em uma única chamada.
 */
Leitura ler();

} // namespace mpu6050