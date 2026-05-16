import { Router } from "express";
import { TOPICOS_MQTT } from "@transformer-monitor/shared";
import { WebSocketHub } from "../ws/hub";

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

export function createSimuladorRouter(wsHub: WebSocketHub): Router {
  const router = Router();
  let intervalo: ReturnType<typeof setInterval> | null = null;

  router.post("/iniciar", (_req, res) => {
    if (intervalo) return res.json({ ok: true });

    intervalo = setInterval(() => {
      for (const [topico, cfg] of Object.entries(GERADORES)) {
        const data = {
          topico,
          ts: Math.floor(Date.now() / 1000),
          valor: gerarValor(cfg),
          unidade: UNIDADES[topico],
        };
        wsHub.broadcast(data);
      }

      wsHub.broadcast({
        topico: TOPICOS_MQTT.heartbeat,
        ts: Math.floor(Date.now() / 1000),
        valor: 1,
        unidade: "",
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
