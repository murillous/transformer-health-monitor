#include "sct013.h"
#include "config.h"

namespace sct013 {

float lerRMS(uint8_t pino)
{
    float somatorio = 0.0f;
    unsigned long alvo_us = micros();

    for (int i = 0; i < N_AMOSTRAS_RMS; i++) {
        const float tensao = (analogRead(pino) * VREF / ADC_RES) - BIAS;
        somatorio += tensao * tensao;
        // Busy-wait determinístico até o próximo slot de 200µs.
        // Substitui delayMicroseconds() pra alinhar com convenção zero-delay.
        alvo_us += 200UL;
        while ((long)(micros() - alvo_us) < 0) {
            // spin curto
        }
    }

    return sqrt(somatorio / N_AMOSTRAS_RMS);
}

float lerInstantaneoAbs(uint8_t pino)
{
    const float tensao = (analogRead(pino) * VREF / ADC_RES) - BIAS;
    return fabs(tensao);
}

void capturarOnda(uint8_t pino, float* out, uint16_t n, uint16_t periodo_us)
{
    const unsigned long t0 = micros();
    for (uint16_t i = 0; i < n; i++) {
        while ((micros() - t0) < (unsigned long)i * periodo_us) {
            // spin — espera até o instante da próxima amostra
        }
        out[i] = (analogRead(pino) * VREF / ADC_RES) - BIAS;
    }
}

} // namespace sct013
