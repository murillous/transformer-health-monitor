#include "ds18b20.h"
#include "config.h"
#include <OneWire.h>
#include <DallasTemperature.h>

namespace {

OneWire           oneWire(PINO_DS18B20);
DallasTemperature sensor(&oneWire);
float             ultimaTempValida = NAN;

} // namespace anônimo

namespace ds18b20 {

uint8_t iniciar()
{
    sensor.begin();
    // sensor.setResolution(12);
    // sensor.setWaitForConversion(true);
    return sensor.getDeviceCount();
}

float lerTemperatura()
{
    sensor.requestTemperatures();

    const float temp = sensor.getTempCByIndex(0);

    const bool invalida =
        (temp == DEVICE_DISCONNECTED_C) ||
        (temp == 85.0f) ||
        (temp < -55.0f) ||
        isnan(temp);

    if (invalida) return ultimaTempValida;

    ultimaTempValida = temp;
    return temp;
}

} // namespace ds18b20