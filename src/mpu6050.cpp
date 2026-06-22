#include "mpu6050.h"
#include <Wire.h>

#if defined(ESP32)
#include <MPU9250-DMP.h>

namespace {
static MPU9250_DMP imu;
} // namespace anônimo

namespace mpu6050 {

bool iniciar()
{
    if (imu.begin() != INV_SUCCESS) return false;

    imu.setSensors(INV_XYZ_GYRO | INV_XYZ_ACCEL);
    imu.setAccelFSR(2);     // ±2g — mesma faixa do MPU6050 anterior (16384 LSB/g)
    imu.setGyroFSR(250);    // ±250dps — mesma faixa do MPU6050 anterior (131 LSB/dps)
    return true;
}

Leitura ler()
{
    Leitura r{};
    if (imu.update(UPDATE_ACCEL | UPDATE_GYRO) != INV_SUCCESS) return r;

    r.ax = imu.calcAccel(imu.ax);
    r.ay = imu.calcAccel(imu.ay);
    r.az = imu.calcAccel(imu.az);
    r.gx = imu.calcGyro(imu.gx);
    r.gy = imu.calcGyro(imu.gy);
    r.gz = imu.calcGyro(imu.gz);
    return r;
}

} // namespace mpu6050

#else

namespace {

constexpr uint8_t MPU_ADDR          = 0x68;
constexpr uint8_t REG_PWR           = 0x6B;
constexpr uint8_t REG_WHO_AM_I      = 0x75;
constexpr uint8_t REG_ACCEL_X       = 0x3B;
constexpr uint8_t REG_GYRO_X        = 0x43;
constexpr float   ACCEL_LSB_POR_G   = 16384.0f;
constexpr float   GYRO_LSB_POR_DPS  = 131.0f;

static int16_t lerRegistrador16(uint8_t reg)
{
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, (uint8_t)2);

    const uint8_t high = Wire.read();
    const uint8_t low  = Wire.read();
    return (int16_t)((high << 8) | low);
}

} // namespace anônimo

namespace mpu6050 {

bool iniciar()
{
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(REG_PWR);
    Wire.write(0x00);
    Wire.endTransmission();

    Wire.beginTransmission(MPU_ADDR);
    Wire.write(REG_WHO_AM_I);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, (uint8_t)1);

    if (!Wire.available()) return false;
    return Wire.read() == MPU_ADDR;
}

Leitura ler()
{
    Leitura r;
    r.ax = lerRegistrador16(REG_ACCEL_X)     / ACCEL_LSB_POR_G;
    r.ay = lerRegistrador16(REG_ACCEL_X + 2) / ACCEL_LSB_POR_G;
    r.az = lerRegistrador16(REG_ACCEL_X + 4) / ACCEL_LSB_POR_G;
    r.gx = lerRegistrador16(REG_GYRO_X)      / GYRO_LSB_POR_DPS;
    r.gy = lerRegistrador16(REG_GYRO_X + 2)  / GYRO_LSB_POR_DPS;
    r.gz = lerRegistrador16(REG_GYRO_X + 4)  / GYRO_LSB_POR_DPS;
    return r;
}

} // namespace mpu6050

#endif
