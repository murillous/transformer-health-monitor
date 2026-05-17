#include "ds18b20.h"
#include "config.h"
#include <OneWire.h>
#include <DallasTemperature.h>

namespace {

static OneWire           oneWire(PINO_DS18B20);
static DallasTemperature sensor(&oneWire);
static float             ultimaTempValida = NAN;

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
