import { Router } from "express";
import { TOPICOS_MQTT, mapearGrandeza, avaliarSeveridade, LIMITES } from "@transformer-monitor/shared";
import { WebSocketHub } from "../ws/hub";
import { store } from "../db/store";
import { executarDiagnostico } from "./diagnostico";

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

const AMOSTRAS = 128;

function gerarFormaOnda(fundamental: number, harm2: number, harm4: number): number[] {
  const escala = Math.min(1.5, Math.max(0.2, Math.abs(fundamental) * 0.3));
  const onda: number[] = [];
  for (let i = 0; i < AMOSTRAS; i++) {
    const t = i / AMOSTRAS;
    const amp = Math.sin(2 * Math.PI * t) * escala
      + Math.sin(2 * Math.PI * 2 * t) * harm2 * 2
      + Math.sin(2 * Math.PI * 4 * t) * harm4 * 3;
    onda.push(Math.round(amp * 1000) / 1000);
  }
  return onda;
}

function gerarFormaOndaComRuido(fundamental: number, harm2: number, harm4: number): number[] {
  const escala = Math.min(1.5, Math.max(0.2, Math.abs(fundamental) * 0.3));
  const onda: number[] = [];
  for (let i = 0; i < AMOSTRAS; i++) {
    const t = i / AMOSTRAS;
    const amp = Math.sin(2 * Math.PI * t) * escala
      + Math.sin(2 * Math.PI * 2 * t) * harm2 * 2
      + Math.sin(2 * Math.PI * 4 * t) * harm4 * 3;
    const noisy = amp * (1 + (Math.random() - 0.5) * 0.04);
    onda.push(Math.round(noisy * 1000) / 1000);
  }
  return onda;
}

export function createSimuladorRouter(wsHub: WebSocketHub): Router {
  const router = Router();
  let intervalo: ReturnType<typeof setInterval> | null = null;
  let intervaloOnda: ReturnType<typeof setInterval> | null = null;
  let ultimasLeituras: Record<string, number> = {};

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

      ultimasLeituras = valores;

      // Inrush sintetico: spike ocasional pra demonstrar diagnostico fuzzy.
      // ~1 a cada 40s (prob 0.025 @ tick 1s). Inrush e evento discreto — so
      // emite quando dispara, ausente das outras leituras.
      if (Math.random() < 0.025) {
        const inrushVal = Math.round((1.8 + Math.random() * 2.7) * 100) / 100;
        wsHub.broadcast({
          topico: TOPICOS_MQTT.inrushPrimario,
          ts: Math.floor(Date.now() / 1000),
          valor: inrushVal,
          unidade: "A",
        });
        store.push({
          timestamp: agora,
          topico: TOPICOS_MQTT.inrushPrimario,
          valor: inrushVal,
          unidade: "A",
          alarme: "",
        });
        const sev = avaliarSeveridade("inrushPrimario", inrushVal);
        if (sev !== "ok") {
          store.pushAlarme({
            ts: Math.floor(Date.now() / 1000),
            tipo: TOPICOS_MQTT.inrushPrimario,
            sev,
            valor: inrushVal,
            limite: sev === "critico" ? LIMITES.inrushPrimario.critico : LIMITES.inrushPrimario.aviso,
          });
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

      executarDiagnostico()
        .then((diag) => {
          wsHub.broadcast({ topico: "diagnostico", ts: Math.floor(Date.now() / 1000), diagnostico: diag });
        })
        .catch(() => {});
    }, 1000);

    intervaloOnda = setInterval(() => {
      const leituras = ultimasLeituras;
      if (Object.keys(leituras).length === 0) return;

      const ondaP = gerarFormaOndaComRuido(
        leituras[TOPICOS_MQTT.correntePrimario] ?? 2.8,
        leituras[TOPICOS_MQTT.vibracao120hz] / 10,
        leituras[TOPICOS_MQTT.vibracao240hz] / 5,
      );
      const ondaS = gerarFormaOndaComRuido(
        leituras[TOPICOS_MQTT.correnteSecundario] ?? 22,
        leituras[TOPICOS_MQTT.vibracao120hz] / 10,
        leituras[TOPICOS_MQTT.vibracao240hz] / 5,
      );

      wsHub.broadcast({ topico: "onda_corrente_primario", ts: Math.floor(Date.now() / 1000), amostras: ondaP });
      wsHub.broadcast({ topico: "onda_corrente_secundario", ts: Math.floor(Date.now() / 1000), amostras: ondaS });
    }, 200);

    res.json({ ok: true });
  });

  router.post("/parar", (_req, res) => {
    if (intervalo) {
      clearInterval(intervalo);
      intervalo = null;
    }
    if (intervaloOnda) {
      clearInterval(intervaloOnda);
      intervaloOnda = null;
    }
    res.json({ ok: true });
  });

  return router;
}
