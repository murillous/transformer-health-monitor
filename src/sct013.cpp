#include "sct013.h"
#include "config.h"

namespace sct013 {

float lerRMS(uint8_t pino)
{
    float somatorio = 0.0f;

    for (int i = 0; i < N_AMOSTRAS_RMS; i++) {
        const float tensao = (analogRead(pino) * VREF / ADC_RES) - BIAS;
        somatorio += tensao * tensao;
        delayMicroseconds(200);
    }

    return sqrt(somatorio / N_AMOSTRAS_RMS);
}

float lerInstantaneoAbs(uint8_t pino)
{
    const float tensao = (analogRead(pino) * VREF / ADC_RES) - BIAS;
    return fabs(tensao);
}

} // namespace sct013
