import { Router } from "express";
import { TOPICOS_MQTT, mapearGrandeza, avaliarSeveridade, LIMITES } from "@transformer-monitor/shared";
import { WebSocketHub } from "../ws/hub";
import { store } from "../db/store";

interface Gerador {
  base: number;
  variacao: number;
  spikeProb: number;
  spikeMag: number;
}

const GERADORES: Record<string, Gerador> = {
  [TOPICOS_MQTT.temperaturaNucleo]: { base: 55, variacao: 10, spikeProb: 0.05, spikeMag: 20 },
  [TOPICOS_MQTT.deltaT]: { base: 8, variacao: 4, spikeProb: 0.03, spikeMag: 15 },
  [TOPICOS_MQTT.correntePrimario]: { base: 2.8, variacao: 0.8, spikeProb: 0.04, spikeMag: 3 },
  [TOPICOS_MQTT.correnteSecundario]: { base: 22, variacao: 6, spikeProb: 0.04, spikeMag: 20 },
  [TOPICOS_MQTT.vibracao120hz]: { base: 0.08, variacao: 0.06, spikeProb: 0.06, spikeMag: 0.4 },
  [TOPICOS_MQTT.vibracao240hz]: { base: 0.04, variacao: 0.04, spikeProb: 0.05, spikeMag: 0.2 },
};

const UNIDADES: Record<string, string> = {
  [TOPICOS_MQTT.temperaturaNucleo]: "°C",
  [TOPICOS_MQTT.deltaT]: "°C",
  [TOPICOS_MQTT.correntePrimario]: "A",
  [TOPICOS_MQTT.correnteSecundario]: "A",
  [TOPICOS_MQTT.vibracao120hz]: "g",
  [TOPICOS_MQTT.vibracao240hz]: "g",
};

function gerarValor(cfg: Gerador): number {
  const noise = (Math.random() - 0.5) * 2 * cfg.variacao;
  let v = cfg.base + noise;
  if (Math.random() < cfg.spikeProb) {
    v += cfg.spikeMag * (0.5 + Math.random());
  }
  return Math.max(0, Math.round(v * 100) / 100);
}

function gerarEspectro(vib120: number, vib240: number): { freq: number; amplitude: number }[] {
  const bins = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600];
  const pico120 = vib120;
  const pico240 = vib240;
  return bins.map((freq) => {
    let amp: number;
    if (freq === 120) amp = pico120;
    else if (freq === 240) amp = pico240;
    else if (freq === 60) amp = pico120 * 0.08 + Math.random() * 0.01;
    else if (freq === 180) amp = pico120 * 0.15 + Math.random() * 0.02;
    else if (freq === 300) amp = pico240 * 0.2 + Math.random() * 0.02;
    else amp = Math.max(0, (pico120 + pico240) * 0.05 * (1 - (freq - 360) / 600) + Math.random() * 0.01);
    return { freq, amplitude: Math.round(amp * 1000) / 1000 };
  });
}

export function createSimuladorRouter(wsHub: WebSocketHub): Router {
  const router = Router();
  let intervalo: ReturnType<typeof setInterval> | null = null;

  router.post("/iniciar", (_req, res) => {
    if (intervalo) return res.json({ ok: true });

    intervalo = setInterval(() => {
      const valores: Record<string, number> = {};
      const agora = new Date().toISOString();

      for (const [topico, cfg] of Object.entries(GERADORES)) {
        const v = gerarValor(cfg);
        valores[topico] = v;
        wsHub.broadcast({
          topico,
          ts: Math.floor(Date.now() / 1000),
          valor: v,
          unidade: UNIDADES[topico],
        });

        store.push({
          timestamp: agora,
          topico,
          valor: v,
          unidade: UNIDADES[topico],
          alarme: "",
        });

        const grandeza = mapearGrandeza(topico);
        if (grandeza) {
          const sev = avaliarSeveridade(grandeza, v);
          if (sev !== "ok") {
            store.pushAlarme({
              ts: Math.floor(Date.now() / 1000),
              tipo: topico,
              sev,
              valor: v,
              limite: sev === "critico" ? LIMITES[grandeza].critico : LIMITES[grandeza].aviso,
            });
          }
        }
      }

      wsHub.broadcast({
        topico: TOPICOS_MQTT.heartbeat,
        ts: Math.floor(Date.now() / 1000),
        valor: 1,
        unidade: "",
      });

      wsHub.broadcast({
        topico: "transformador/vibracao/espectro",
        ts: Math.floor(Date.now() / 1000),
        espectro: gerarEspectro(
          valores[TOPICOS_MQTT.vibracao120hz],
          valores[TOPICOS_MQTT.vibracao240hz]
        ),
      });
    }, 1500);

    res.json({ ok: true });
  });

  router.post("/parar", (_req, res) => {
    if (intervalo) {
      clearInterval(intervalo);
      intervalo = null;
    }
    res.json({ ok: true });
  });

  return router;
}
