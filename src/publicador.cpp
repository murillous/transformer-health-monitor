/**
 * @file    publicador.cpp
 * @brief   Implementação da camada de transporte.
 */

#include "publicador.h"
#include "config.h"

#if defined(ESP32)
    #include <WiFi.h>
    #include <PubSubClient.h>

    static WiFiClient    wifiClient;
    static PubSubClient  mqtt(wifiClient);

    constexpr const char* WIFI_SSID     = "SUA_REDE";
    constexpr const char* WIFI_PASS     = "SUA_SENHA";
    constexpr const char* MQTT_BROKER   = "192.168.1.100";
    constexpr uint16_t    MQTT_PORT     = 1883;
    constexpr const char* MQTT_CLIENTE  = "transformador-01";
    constexpr unsigned long INTERVALO_RECONEXAO_MS = 5000UL;
    static unsigned long ultima_tentativa_mqtt_ms = 0;
#endif

namespace publicador {

void iniciar()
{
#if defined(ESP32)
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    mqtt.setServer(MQTT_BROKER, MQTT_PORT);
    mqtt.setBufferSize(512);   // espectro JSON com 5 harmônicas cabe folgado
#else
    // No Arduino o Serial já foi inicializado no setup()
#endif
}

void publicar(const char* topico, float valor, const char* unidade)
{
    // dtostrf() converte float para string — necessário no AVR pois snprintf
    // não suporta %f por padrão (economia de memória)
    char valorStr[16];
    dtostrf(valor, 0, 4, valorStr);  // largura mínima 0, 4 casas decimais

    char payload[96];
    snprintf(payload, sizeof(payload),
             "{\"ts\":%lu,\"valor\":%s,\"unidade\":\"%s\"}",
             millis() / 1000, valorStr, unidade);

#if defined(ESP32)
    mqtt.publish(topico, payload);
#else
    Serial.print(F("[MQTT] "));
    Serial.print(topico);
    Serial.print(F(" -> "));
    Serial.println(payload);
#endif
}

void publicarAlarme(const char* tipo, const char* severidade,
                    float valor, float limite, const char* mensagem)
{
    char valorStr[16];
    char limiteStr[16];
    dtostrf(valor, 0, 4, valorStr);
    dtostrf(limite, 0, 4, limiteStr);

    char payload[192];
    snprintf(payload, sizeof(payload),
             "{\"ts\":%lu,\"tipo\":\"%s\",\"severidade\":\"%s\","
             "\"valor\":%s,\"limite\":%s,\"mensagem\":\"%s\"}",
             millis() / 1000, tipo, severidade, valorStr, limiteStr, mensagem);

#if defined(ESP32)
    mqtt.publish(TOPICO_ALARME, payload, true);
#else
    Serial.print(F("[MQTT] "));
    Serial.print(TOPICO_ALARME);
    Serial.print(F(" -> "));
    Serial.println(payload);
#endif
}

void publicarEspectro(const char* topico, const int* freqs,
                      const float* amplitudes, uint16_t n_bins)
{
    const unsigned long ts = millis() / 1000UL;

#if defined(ESP32)
    char payload[400];
    int pos = snprintf(payload, sizeof(payload),
                       "{\"ts\":%lu,\"espectro\":[", ts);
    for (uint16_t i = 0; i < n_bins && pos < (int)sizeof(payload) - 40; i++) {
        char ampBuf[12];
        dtostrf(amplitudes[i], 0, 4, ampBuf);
        pos += snprintf(payload + pos, sizeof(payload) - pos,
                        "%s{\"freq\":%d,\"amplitude\":%s}",
                        (i > 0) ? "," : "", freqs[i], ampBuf);
    }
    snprintf(payload + pos, sizeof(payload) - pos, "]}");
    mqtt.publish(topico, payload);
#else
    Serial.print(F("[MQTT] "));
    Serial.print(topico);
    Serial.print(F(" -> {\"ts\":"));
    Serial.print(ts);
    Serial.print(F(",\"espectro\":["));
    for (uint16_t i = 0; i < n_bins; i++) {
        if (i > 0) Serial.print(',');
        Serial.print(F("{\"freq\":"));
        Serial.print(freqs[i]);
        Serial.print(F(",\"amplitude\":"));
        char ampBuf[12];
        dtostrf(amplitudes[i], 0, 4, ampBuf);
        Serial.print(ampBuf);
        Serial.print('}');
    }
    Serial.println(F("]}"));
#endif
}

void publicarOnda(const char* topico, const float* amostras, uint16_t n)
{
    const unsigned long ts = millis() / 1000UL;

#if defined(ESP32)
    char payload[600];  // 32 amostras × ~8 chars + overhead cabe folgado
    int pos = snprintf(payload, sizeof(payload),
                       "{\"ts\":%lu,\"amostras\":[", ts);
    for (uint16_t i = 0; i < n && pos < (int)sizeof(payload) - 12; i++) {
        char buf[10];
        dtostrf(amostras[i], 0, 2, buf);
        pos += snprintf(payload + pos, sizeof(payload) - pos,
                        "%s%s", (i > 0) ? "," : "", buf);
    }
    snprintf(payload + pos, sizeof(payload) - pos, "]}");
    mqtt.publish(topico, payload);
#else
    Serial.print(F("[MQTT] "));
    Serial.print(topico);
    Serial.print(F(" -> {\"ts\":"));
    Serial.print(ts);
    Serial.print(F(",\"amostras\":["));
    for (uint16_t i = 0; i < n; i++) {
        if (i > 0) Serial.print(',');
        char buf[10];
        dtostrf(amostras[i], 0, 2, buf);
        Serial.print(buf);
    }
    Serial.println(F("]}"));
#endif
}

void manter()
{
#if defined(ESP32)
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    if (!mqtt.connected()) {
        const unsigned long agora_ms = millis();
        if (agora_ms - ultima_tentativa_mqtt_ms >= INTERVALO_RECONEXAO_MS) {
            ultima_tentativa_mqtt_ms = agora_ms;
            mqtt.connect(MQTT_CLIENTE);
        }
        return;
    }

    mqtt.loop();
#endif
}

} // namespace publicador
