#include "ds18b20.h"
#include "config.h"
#include <OneWire.h>
#include <DallasTemperature.h>

namespace {

static OneWire           oneWire(PINO_DS18B20);
static DallasTemperature sensor(&oneWire);
static float             ultimaTempValida = NAN;

// Conversao assincrona: dispara requestTemperatures(), espera
// MS_CONVERSAO ms via millis(), depois le e dispara novamente.
// Evita o delay(750) implicito do setWaitForConversion(true).
//
// No Proteus, props do modelo aceleram a conversao a <10ms, entao
// chamadas subsequentes ja encontram valor pronto. No silicio real
// (ESP32), respeita o ciclo real de 12-bit (~750ms).
constexpr unsigned long MS_CONVERSAO = 750UL;
static unsigned long disparo_ms = 0;
static bool disparado = false;

} // namespace anônimo

namespace ds18b20 {

uint8_t iniciar()
{
    sensor.begin();
    sensor.setResolution(12);
    sensor.setWaitForConversion(false);  // nao bloqueia em requestTemperatures()
    sensor.requestTemperatures();        // primeiro disparo
    disparo_ms = millis();
    disparado = true;
    return sensor.getDeviceCount();
}

float lerTemperatura()
{
    const unsigned long agora = millis();

    if (!disparado) {
        sensor.requestTemperatures();
        disparo_ms = agora;
        disparado = true;
        return ultimaTempValida;
    }

    if (agora - disparo_ms < MS_CONVERSAO) {
        // conversao ainda em curso — devolve cache
        return ultimaTempValida;
    }

    const float temp = sensor.getTempCByIndex(0);

    // Redispara imediatamente pra proxima leitura.
    sensor.requestTemperatures();
    disparo_ms = agora;

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
