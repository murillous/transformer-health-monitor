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
