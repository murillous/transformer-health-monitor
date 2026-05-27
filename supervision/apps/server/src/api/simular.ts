import { Router } from "express";
import { TOPICOS_MQTT, mapearGrandeza, avaliarSeveridade, LIMITES } from "@transformer-monitor/shared";
import { WebSocketHub } from "../ws/hub";
import { store } from "../db/store";
import { executarDiagnostico, atualizarEspectro, registrarInrush } from "./diagnostico";

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

// Override de cenário: mescla com GERADORES enquanto ativo (até overrideUntil).
// Usado pela rota POST /cenario pra forçar condições de falha durante demo.
let cenarioOverride: Partial<Record<string, Partial<Gerador>>> = {};
let cenarioUntil = 0;
let cenarioAtivo: string | null = null;

// Queue de inrush forçados (cenário inrush_severo dispara 3 em sequência).
const inrushForcado: number[] = [];

function gerarValor(cfg: Gerador, topico?: string): number {
  // Aplica override do cenário se ativo e tópico match
  const o = topico && Date.now() < cenarioUntil ? cenarioOverride[topico] : undefined;
  const merged: Gerador = o ? { ...cfg, ...o } : cfg;
  const noise = (Math.random() - 0.5) * 2 * merged.variacao;
  let v = merged.base + noise;
  if (Math.random() < merged.spikeProb) {
    v += merged.spikeMag * (0.5 + Math.random());
  }
  return Math.max(0, Math.round(v * 100) / 100);
}

function gerarEspectro(vib120: number, vib240: number): { freq: number; amplitude: number }[] {
  // Mesmos 5 bins que o firmware publica (main.cpp FREQS_HARMONICAS)
  const bins = [120, 240, 360, 480, 600];
  return bins.map((freq) => {
    let amp: number;
    if (freq === 120) amp = vib120;
    else if (freq === 240) amp = vib240;
    else {
      // Harmônicas superiores decaem com a ordem (1/n típico em transformadores)
      const ordem = freq / 120;
      amp = Math.max(0, vib120 * (0.4 / ordem) + Math.random() * 0.01);
    }
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
        const v = gerarValor(cfg, topico);
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

      // Inrush sintetico: spike ocasional + queue forçada por cenário.
      // ~1 a cada 40s natural (prob 0.025). Quando cenário inrush_severo
      // dispara, queue força N picos em ticks consecutivos.
      const inrushForcadoVal = inrushForcado.shift();
      const dispararInrush = inrushForcadoVal != null || Math.random() < 0.025;
      if (dispararInrush) {
        const inrushVal = inrushForcadoVal != null
          ? inrushForcadoVal
          : Math.round((1.8 + Math.random() * 2.7) * 100) / 100;
        registrarInrush();  // alimenta calcTaxaInrush (eventos / 5 min)
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

      const espectro = gerarEspectro(
        valores[TOPICOS_MQTT.vibracao120hz],
        valores[TOPICOS_MQTT.vibracao240hz]
      );
      atualizarEspectro(espectro);  // alimenta calcTHD/calcRatioHarmonicas
      wsHub.broadcast({
        topico: "transformador/vibracao/espectro",
        ts: Math.floor(Date.now() / 1000),
        espectro,
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

  // Aplica cenário de falha — sobrepõe GERADORES por N segundos.
  // Tipos: sobreaquecimento | sobrecarga | vibracao_critica | inrush_severo |
  //        falha_eletromecanica | normal (limpa override)
  router.post("/cenario", (req, res) => {
    const { tipo, duracao_s = 30 } = req.body ?? {};
    cenarioOverride = {};
    cenarioUntil = Date.now() + Math.max(5, Math.min(duracao_s, 300)) * 1000;
    cenarioAtivo = tipo;

    switch (tipo) {
      case "sobreaquecimento":
        cenarioOverride[TOPICOS_MQTT.temperaturaNucleo] = { base: 92, variacao: 2, spikeProb: 0, spikeMag: 0 };
        cenarioOverride[TOPICOS_MQTT.deltaT] = { base: 28, variacao: 1, spikeProb: 0, spikeMag: 0 };
        break;
      case "sobrecarga":
        cenarioOverride[TOPICOS_MQTT.correntePrimario] = { base: 6.8, variacao: 0.3, spikeProb: 0, spikeMag: 0 };
        cenarioOverride[TOPICOS_MQTT.correnteSecundario] = { base: 50, variacao: 2, spikeProb: 0, spikeMag: 0 };
        cenarioOverride[TOPICOS_MQTT.temperaturaNucleo] = { base: 78, variacao: 2, spikeProb: 0, spikeMag: 0 };
        break;
      case "vibracao_critica":
        cenarioOverride[TOPICOS_MQTT.vibracao120hz] = { base: 0.52, variacao: 0.03, spikeProb: 0, spikeMag: 0 };
        cenarioOverride[TOPICOS_MQTT.vibracao240hz] = { base: 0.28, variacao: 0.02, spikeProb: 0, spikeMag: 0 };
        break;
      case "inrush_severo":
        // Queue: 4 inrushes consecutivos com pico crescente
        inrushForcado.push(2.5, 3.2, 3.8, 4.2);
        break;
      case "falha_eletromecanica":
        // Combo: corrente alta + vibração alta + temperatura subindo lento
        cenarioOverride[TOPICOS_MQTT.correntePrimario] = { base: 5.5, variacao: 0.4, spikeProb: 0.1, spikeMag: 1 };
        cenarioOverride[TOPICOS_MQTT.vibracao120hz] = { base: 0.35, variacao: 0.05, spikeProb: 0.1, spikeMag: 0.1 };
        cenarioOverride[TOPICOS_MQTT.vibracao240hz] = { base: 0.18, variacao: 0.03, spikeProb: 0, spikeMag: 0 };
        cenarioOverride[TOPICOS_MQTT.temperaturaNucleo] = { base: 75, variacao: 3, spikeProb: 0.05, spikeMag: 5 };
        break;
      case "normal":
      case "limpar":
        cenarioUntil = 0;
        cenarioAtivo = null;
        break;
      default:
        cenarioUntil = 0;
        cenarioAtivo = null;
        return res.status(400).json({ erro: `Cenário desconhecido: ${tipo}` });
    }

    res.json({
      ok: true,
      tipo: cenarioAtivo,
      ate_ms: cenarioUntil,
      duracao_s,
    });
  });

  router.get("/cenario/atual", (_req, res) => {
    if (Date.now() >= cenarioUntil) {
      cenarioAtivo = null;
    }
    res.json({
      tipo: cenarioAtivo,
      ate_ms: cenarioUntil,
      restante_s: Math.max(0, Math.floor((cenarioUntil - Date.now()) / 1000)),
    });
  });

  return router;
}
