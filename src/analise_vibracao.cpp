#include "analise_vibracao.h"

#include <arduinoFFT.h>

#include "mpu6050.h"

namespace {

constexpr uint16_t AMOSTRAS_FFT = 32;
constexpr float FREQ_AMOSTRAGEM_HZ = 1920.0f;  // 60Hz/bin — cobre harmônicas 120..600Hz sem leakage; N=32 ajusta RAM AVR
constexpr unsigned long INTERVALO_AMOSTRA_US =
    (unsigned long)(1000000.0f / FREQ_AMOSTRAGEM_HZ);

static float v_real[AMOSTRAS_FFT];
static float v_imag[AMOSTRAS_FFT];
static uint16_t indice_amostra = 0;
static unsigned long ultima_amostra_us = 0;
static ArduinoFFT<float> fft(v_real, v_imag, AMOSTRAS_FFT, FREQ_AMOSTRAGEM_HZ);

} // namespace

namespace analise_vibracao {

void iniciar()
{
    indice_amostra = 0;
    ultima_amostra_us = micros();
    for (uint16_t i = 0; i < AMOSTRAS_FFT; i++) {
        v_real[i] = 0.0f;
        v_imag[i] = 0.0f;
    }
}

Espectro atualizar()
{
    Espectro espectro = {false, NAN, NAN};
    const unsigned long agora_us = micros();

    if (agora_us - ultima_amostra_us < INTERVALO_AMOSTRA_US) {
        return espectro;
    }

    ultima_amostra_us += INTERVALO_AMOSTRA_US;

    const mpu6050::Leitura leitura = mpu6050::ler();
    v_real[indice_amostra] = leitura.az;
    v_imag[indice_amostra] = 0.0f;
    indice_amostra++;

    if (indice_amostra < AMOSTRAS_FFT) {
        return espectro;
    }

    indice_amostra = 0;
    fft.dcRemoval();
    fft.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
    fft.compute(FFT_FORWARD);
    fft.complexToMagnitude();

    espectro.novo = true;
    espectro.fft_120hz = amplitudeEmFreq(120.0f);
    espectro.fft_240hz = amplitudeEmFreq(240.0f);
    return espectro;
}

const float* magnitudes()             { return v_real; }
uint16_t      numAmostras()           { return AMOSTRAS_FFT; }
float         frequenciaAmostragemHz(){ return FREQ_AMOSTRAGEM_HZ; }

float amplitudeEmFreq(float frequencia_hz)
{
    const uint16_t indice =
        (uint16_t)((frequencia_hz * AMOSTRAS_FFT / FREQ_AMOSTRAGEM_HZ) + 0.5f);
    if (indice >= AMOSTRAS_FFT / 2) return NAN;
    return v_real[indice];
}

} // namespace analise_vibracao
