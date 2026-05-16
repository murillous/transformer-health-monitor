import type { Severidade } from "./types";

export const TOPICOS_MQTT = {
  correntePrimario: "transformador/primario/corrente",
  correnteSecundario: "transformador/secundario/corrente",
  temperaturaNucleo: "transformador/nucleo/temperatura",
  deltaT: "transformador/nucleo/delta_t",
  vibracao120hz: "transformador/vibracao/fft_120hz",
  vibracao240hz: "transformador/vibracao/fft_240hz",
  alarme: "transformador/status/alarme",
  heartbeat: "transformador/status/heartbeat",
} as const;

export const TOPICOS_INSCREVER = Object.values(TOPICOS_MQTT);

export const LIMITES: Record<string, { aviso: number; critico: number }> = {
  temperatura: { aviso: 70, critico: 85 },
  deltaT: { aviso: 15, critico: 25 },
  vibracao120hz: { aviso: 0.2, critico: 0.45 },
  correntePrimario: { aviso: 4.0, critico: 6.0 },
  correnteSecundario: { aviso: 30, critico: 45 },
  vibracao240hz: { aviso: 0.1, critico: 0.25 },
};

export function avaliarSeveridade(
  grandeza: string,
  valor: number
): Severidade {
  const limites = LIMITES[grandeza];
  if (!limites) return "ok";
  if (valor >= limites.critico) return "critico";
  if (valor >= limites.aviso) return "aviso";
  return "ok";
}

export function mapearGrandeza(topico: string): string | null {
  const mapa: Record<string, string> = {
    [TOPICOS_MQTT.temperaturaNucleo]: "temperatura",
    [TOPICOS_MQTT.deltaT]: "deltaT",
    [TOPICOS_MQTT.vibracao120hz]: "vibracao120hz",
    [TOPICOS_MQTT.correntePrimario]: "correntePrimario",
    [TOPICOS_MQTT.correnteSecundario]: "correnteSecundario",
    [TOPICOS_MQTT.vibracao240hz]: "vibracao240hz",
  };
  return mapa[topico] ?? null;
}
