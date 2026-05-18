#include "diagnostico.h"

#include "config.h"
#include "publicador.h"

namespace {

enum class EstadoInrush {
    Idle,
    Monitorando,
    Cooldown
};

static EstadoInrush estado_inrush = EstadoInrush::Idle;
static unsigned long inicio_janela_ms = 0;
static unsigned long inicio_cooldown_ms = 0;
static float pico_inrush = 0.0f;

static void publicarAlarmeLimite(const char* tipo, const char* severidade,
                                  float valor, float limite, const char* mensagem)
{
    publicador::publicarAlarme(tipo, severidade, valor, limite, mensagem);
}

} // namespace

namespace diagnostico {

float calcularDeltaT(float temperatura_nucleo)
{
    if (isnan(temperatura_nucleo)) return NAN;
    return temperatura_nucleo - TEMPERATURA_AMBIENTE_C;
}

Inrush atualizarInrush(float corrente_primario_vpico)
{
    const unsigned long agora_ms = millis();
    Inrush resultado = {false, 0.0f};

    switch (estado_inrush) {
    case EstadoInrush::Idle:
        if (corrente_primario_vpico >= LIMIAR_INRUSH_VPICO) {
            estado_inrush = EstadoInrush::Monitorando;
            inicio_janela_ms = agora_ms;
            pico_inrush = corrente_primario_vpico;
        }
        break;

    case EstadoInrush::Monitorando:
        if (corrente_primario_vpico > pico_inrush) {
            pico_inrush = corrente_primario_vpico;
        }

        if (agora_ms - inicio_janela_ms >= JANELA_INRUSH_MS) {
            resultado.detectado = true;
            resultado.pico = pico_inrush;
            estado_inrush = EstadoInrush::Cooldown;
            inicio_cooldown_ms = agora_ms;
        }
        break;

    case EstadoInrush::Cooldown:
        if (agora_ms - inicio_cooldown_ms >= COOLDOWN_INRUSH_MS) {
            estado_inrush = EstadoInrush::Idle;
        }
        break;
    }

    return resultado;
}

void publicarAlarmes(float temperatura_nucleo, float delta_t,
                     float fft_120hz, const Inrush& inrush)
{
    if (!isnan(temperatura_nucleo)) {
        if (temperatura_nucleo >= LIMIAR_TEMP_CRITICO_C) {
            publicarAlarmeLimite("temperatura", "critico",
                                 temperatura_nucleo, LIMIAR_TEMP_CRITICO_C,
                                 "Temperatura do nucleo em nivel critico");
        } else if (temperatura_nucleo >= LIMIAR_TEMP_AVISO_C) {
            publicarAlarmeLimite("temperatura", "aviso",
                                 temperatura_nucleo, LIMIAR_TEMP_AVISO_C,
                                 "Temperatura do nucleo acima do normal");
        }
    }

    if (!isnan(delta_t)) {
        if (delta_t >= LIMIAR_DELTA_T_CRITICO_C) {
            publicarAlarmeLimite("delta_t", "critico",
                                 delta_t, LIMIAR_DELTA_T_CRITICO_C,
                                 "Gradiente termico critico para a carga atual");
        } else if (delta_t >= LIMIAR_DELTA_T_AVISO_C) {
            publicarAlarmeLimite("delta_t", "aviso",
                                 delta_t, LIMIAR_DELTA_T_AVISO_C,
                                 "Gradiente termico elevado");
        }
    }

    if (!isnan(fft_120hz)) {
        if (fft_120hz >= LIMIAR_FFT_120HZ_CRITICO_G) {
            publicarAlarmeLimite("vibracao_120hz", "critico",
                                 fft_120hz, LIMIAR_FFT_120HZ_CRITICO_G,
                                 "Vibracao em 120Hz em nivel critico");
        } else if (fft_120hz >= LIMIAR_FFT_120HZ_AVISO_G) {
            publicarAlarmeLimite("vibracao_120hz", "aviso",
                                 fft_120hz, LIMIAR_FFT_120HZ_AVISO_G,
                                 "Vibracao em 120Hz acima do limite");
        }
    }

    if (inrush.detectado) {
        publicarAlarmeLimite("inrush", "aviso",
                             inrush.pico, LIMIAR_INRUSH_VPICO,
                             "Pico de inrush detectado no primario");
    }
}

} // namespace diagnostico
