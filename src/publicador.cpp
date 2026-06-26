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

    // Credenciais via build flags (-D no platformio.ini env:esp32). Fallback
    // pra placeholders quando vars de ambiente nao estao setadas — compila
    // pra teste mas nao conecta em rede real.
    #ifndef WIFI_SSID_BUILD
    #define WIFI_SSID_BUILD "MICROESP"
    #endif
    #ifndef WIFI_PASS_BUILD
    #define WIFI_PASS_BUILD "microcontrol"
    #endif
    #ifndef MQTT_BROKER_BUILD
    #define MQTT_BROKER_BUILD "10.116.70.149"
    #endif

    constexpr const char* WIFI_SSID     = WIFI_SSID_BUILD;
    constexpr const char* WIFI_PASS     = WIFI_PASS_BUILD;
    constexpr const char* MQTT_BROKER   = MQTT_BROKER_BUILD;
    constexpr uint16_t    MQTT_PORT     = 1883;
    constexpr const char* MQTT_CLIENTE  = "transformador-01";
    constexpr unsigned long INTERVALO_RECONEXAO_MS = 5000UL;
    static unsigned long ultima_tentativa_mqtt_ms = 0;
    static unsigned long ultima_tentativa_wifi_ms = 0;

    // Estado anterior pra logar apenas transicoes (evita spam a cada loop).
    static bool wifi_estava_conectado = false;
    static bool mqtt_estava_conectado = false;
#endif

namespace publicador {

void iniciar()
{
#if defined(ESP32)
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    mqtt.setServer(MQTT_BROKER, MQTT_PORT);
    mqtt.setBufferSize(512);   // espectro JSON com 5 harmônicas cabe folgado

    // Log de boot: confirma com quais credenciais/broker o firmware foi
    // compilado — pega SSID errado ou IP de broker errado de cara.
    Serial.print(F("[NET] WiFi conectando a "));
    Serial.println(WIFI_SSID);
    Serial.print(F("[NET] Broker alvo "));
    Serial.print(MQTT_BROKER);
    Serial.print(':');
    Serial.println(MQTT_PORT);
#else
    // No Arduino o Serial já foi inicializado no setup()
#endif
}

void publicar(const char* topico, float valor, const char* unidade)
{
    // NaN guard: dtostrf(NAN) emite literal "nan" -> JSON invalido no server.
    // Cache do ds18b20 cobre o proximo ciclo quando a leitura volta a ser valida.
    if (isnan(valor)) return;

    // dtostrf() converte float para string — necessário no AVR pois snprintf
    // não suporta %f por padrão (economia de memória)
    char valorStr[16];
    dtostrf(valor, 0, 4, valorStr);  // largura mínima 0, 4 casas decimais

#if defined(ESP32)
    char payload[96];
    snprintf(payload, sizeof(payload),
             "{\"ts\":%lu,\"valor\":%s,\"unidade\":\"%s\"}",
             millis() / 1000, valorStr, unidade);
    mqtt.publish(topico, payload);
#else
    // Stream direto pelo Serial no UNO — economiza 96 bytes de stack.
    // AVR tem 2KB de RAM e o caminho de alarme (loop->publicarAlarmes->
    // publicarAlarmeLimite->publicarAlarme) empilha varios frames com
    // buffers char[]; cortar o payload[] aqui evita stack overflow no
    // ramo do inrush (que dispara publicar + publicarAlarme sequencial).
    Serial.print(F("[MQTT] "));
    Serial.print(topico);
    Serial.print(F(" -> {\"ts\":"));
    Serial.print(millis() / 1000);
    Serial.print(F(",\"valor\":"));
    Serial.print(valorStr);
    Serial.print(F(",\"unidade\":\""));
    Serial.print(unidade);
    Serial.println(F("\"}"));
#endif
}

void publicarAlarme(const char* tipo, const char* severidade,
                    float valor, float limite, const char* mensagem)
{
    char valorStr[16];
    char limiteStr[16];
    dtostrf(valor, 0, 4, valorStr);
    dtostrf(limite, 0, 4, limiteStr);

#if defined(ESP32)
    char payload[192];
    snprintf(payload, sizeof(payload),
             "{\"ts\":%lu,\"tipo\":\"%s\",\"severidade\":\"%s\","
             "\"valor\":%s,\"limite\":%s,\"mensagem\":\"%s\"}",
             millis() / 1000, tipo, severidade, valorStr, limiteStr, mensagem);
    mqtt.publish(TOPICO_ALARME, payload, true);
#else
    // Stream direto pelo Serial no UNO — payload[192] na stack travava o
    // UNO no caminho de inrush (publicar + publicarAlarme consecutivos
    // empilhavam ~400B, RAM total 2KB, ~448B livres pra stack -> overflow).
    Serial.print(F("[MQTT] "));
    Serial.print(TOPICO_ALARME);
    Serial.print(F(" -> {\"ts\":"));
    Serial.print(millis() / 1000);
    Serial.print(F(",\"tipo\":\""));
    Serial.print(tipo);
    Serial.print(F("\",\"severidade\":\""));
    Serial.print(severidade);
    Serial.print(F("\",\"valor\":"));
    Serial.print(valorStr);
    Serial.print(F(",\"limite\":"));
    Serial.print(limiteStr);
    Serial.print(F(",\"mensagem\":\""));
    Serial.print(mensagem);
    Serial.println(F("\"}"));
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
    const unsigned long agora_ms = millis();

    if (WiFi.status() != WL_CONNECTED) {
        if (wifi_estava_conectado) {
            wifi_estava_conectado = false;
            Serial.println(F("[NET] WiFi caiu — reconectando"));
        }
        // Reconexao throttled — WiFi.reconnect() pode bloquear brevemente
        // durante associacao, mas nao espera handshake completo.
        if (agora_ms - ultima_tentativa_wifi_ms >= INTERVALO_RECONEXAO_MS) {
            ultima_tentativa_wifi_ms = agora_ms;
            WiFi.disconnect();
            WiFi.reconnect();
        }
        return;
    }

    if (!wifi_estava_conectado) {
        wifi_estava_conectado = true;
        Serial.print(F("[NET] WiFi conectado, IP: "));
        Serial.println(WiFi.localIP());
    }

    if (!mqtt.connected()) {
        if (mqtt_estava_conectado) {
            mqtt_estava_conectado = false;
            Serial.println(F("[NET] MQTT caiu"));
        }
        if (agora_ms - ultima_tentativa_mqtt_ms >= INTERVALO_RECONEXAO_MS) {
            ultima_tentativa_mqtt_ms = agora_ms;
            if (mqtt.connect(MQTT_CLIENTE)) {
                mqtt_estava_conectado = true;
                Serial.print(F("[NET] MQTT conectado em "));
                Serial.print(MQTT_BROKER);
                Serial.print(':');
                Serial.println(MQTT_PORT);
            } else {
                // rc do PubSubClient: -4..-1 erro de rede/timeout,
                // 1..5 recusa do broker (protocolo/cliente/auth).
                Serial.print(F("[NET] MQTT falhou, rc="));
                Serial.println(mqtt.state());
            }
        }
        return;
    }

    mqtt.loop();
#endif
}

} // namespace publicador
