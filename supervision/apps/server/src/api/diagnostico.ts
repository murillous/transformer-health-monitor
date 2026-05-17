import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import { store } from "../db/store";

const router = Router();

const PYTHON_SCRIPT = path.resolve(__dirname, "../../../intelligence/main.py");

const MAPA: Record<string, string> = {
  "transformador/nucleo/temperatura": "temperatura",
  "transformador/nucleo/delta_t": "delta_t",
  "transformador/vibracao/fft_120hz": "vibracao_120hz",
  "transformador/vibracao/fft_240hz": "vibracao_240hz",
  "transformador/primario/corrente": "corrente_primario",
  "transformador/secundario/corrente": "corrente_secundario",
};

function mapTopico(topico: string): string {
  return MAPA[topico] ?? topico;
}

const TOPICOS = Object.entries(MAPA).reduce<Record<string, string>>((acc, [k, v]) => {
  acc[v] = k;
  return acc;
}, {});

const LIMIARES: Record<string, { critico: number; aviso: number }> = {
  temperatura: { critico: 85, aviso: 65 },
  delta_t: { critico: 30, aviso: 18 },
  vibracao_120hz: { critico: 11, aviso: 7 },
  vibracao_240hz: { critico: 7, aviso: 3.5 },
};

// In-memory: sliding windows for trend + correlation
const HIST_MAX = 30;
const histTemp: { ts: number; valor: number }[] = [];
const histDeltaT: { ts: number; valor: number }[] = [];
const histCorrente: { ts: number; valor: number }[] = [];
const histVib120: { ts: number; valor: number }[] = [];

// Arrhenius accumulator (in-memory)
let vidaConsumida = 0;
let ultimoTsVida = 0;

const TEMP_REF = 80;

function agingRate(tempC: number): number {
  if (tempC <= 40) return 0.001;
  return Math.pow(2, (tempC - TEMP_REF) / 10);
}

function pushWindow(arr: { ts: number; valor: number }[], ts: number, valor: number): void {
  arr.push({ ts, valor });
  if (arr.length > HIST_MAX) arr.shift();
}

function linearRegression(pontos: { ts: number; valor: number }[]): { inclinacao: number; r2: number } {
  const n = pontos.length;
  if (n < 4) return { inclinacao: 0, r2: 0 };
  const xs = pontos.map((p) => p.ts);
  const ys = pontos.map((p) => p.valor);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { inclinacao: 0, r2: 0 };
  const inclinacao = (n * sumXY - sumX * sumY) / denom;
  const mediaY = sumY / n;
  const ssTot = ys.reduce((s, y) => s + (y - mediaY) ** 2, 0);
  if (ssTot < 1e-10) return { inclinacao: 0, r2: 0 };
  const ssRes = pontos.reduce((s, p, i) => {
    const yHat = mediaY + inclinacao * (p.ts - sumX / n);
    return s + (p.valor - yHat) ** 2;
  }, 0);
  return { inclinacao: inclinacao * 3600, r2: Math.max(0, 1 - ssRes / ssTot) };
}

function calcCorrelacaoCV(): number {
  if (histCorrente.length < 5 || histVib120.length < 5) return 0;
  const cutoff = Date.now() - 20000;
  const recC = histCorrente.filter((p) => p.ts > cutoff).map((p) => p.valor);
  const recV = histVib120.filter((p) => p.ts > cutoff).map((p) => p.valor);
  if (recC.length < 3 || recV.length < 3) return 0;
  const medC = recC.reduce((a, b) => a + b, 0) / recC.length;
  const medV = recV.reduce((a, b) => a + b, 0) / recV.length;
  if (medC <= 3.5 || medV <= 0.12) return 0;
  const n = Math.min(recC.length, recV.length);
  let both = 0;
  for (let i = 0; i < n; i++) {
    if (recC[i] > 3.5 && recV[i] > 0.12) both++;
  }
  return Math.min(100, Math.round((both / n) * 100));
}

function calcTendencias(): Array<{
  grandeza: string;
  label: string;
  inclinacao: number;
  direcao: string;
}> {
  const metricas: Array<{ hist: { ts: number; valor: number }[]; grandeza: string; label: string }> = [
    { hist: histTemp, grandeza: "temperatura", label: "Temperatura" },
    { hist: histDeltaT, grandeza: "delta_t", label: "ΔT" },
  ];

  return metricas.map((m) => {
    const trend = linearRegression(m.hist);
    const inclinacao = Math.round(trend.inclinacao * 100) / 100;
    const direcao = Math.abs(inclinacao) < 0.1 ? "estavel" : inclinacao > 0 ? "subindo" : "descendo";
    return { grandeza: m.grandeza, label: m.label, inclinacao, direcao };
  });
}

function calcPredicoes(): Array<{
  grandeza: string;
  label: string;
  valor_atual: number;
  tendencia: string;
  inclinacao: number;
  tempo_para_alarme: number;
  alarme_em: string;
}> {
  const predicoes: Array<{
    grandeza: string;
    label: string;
    valor_atual: number;
    tendencia: string;
    inclinacao: number;
    tempo_para_alarme: number;
    alarme_em: string;
  }> = [];

  const checks: Array<{ hist: { ts: number; valor: number }[]; grandeza: string; label: string; threshold: number; alarme_em: string }> = [
    { hist: histTemp, grandeza: "temperatura", label: "Temperatura", threshold: LIMIARES.temperatura.critico, alarme_em: "critico" },
    { hist: histTemp, grandeza: "temperatura", label: "Temperatura", threshold: LIMIARES.temperatura.aviso, alarme_em: "aviso" },
    { hist: histDeltaT, grandeza: "delta_t", label: "ΔT", threshold: LIMIARES.delta_t.critico, alarme_em: "critico" },
    { hist: histDeltaT, grandeza: "delta_t", label: "ΔT", threshold: LIMIARES.delta_t.aviso, alarme_em: "aviso" },
  ];

  for (const c of checks) {
    const trend = linearRegression(c.hist);
    if (trend.inclinacao > 0.3 && trend.r2 > 0.3) {
      const valorAtual = c.hist.length > 0 ? c.hist[c.hist.length - 1].valor : 0;
      const dif = c.threshold - valorAtual;
      if (dif > 0) {
        const horas = dif / trend.inclinacao;
        const minutos = Math.round(horas * 60);
        if (minutos < 120) {
          predicoes.push({
            grandeza: c.grandeza,
            label: c.label,
            valor_atual: valorAtual,
            tendencia: "subindo",
            inclinacao: Math.round(trend.inclinacao * 10) / 10,
            tempo_para_alarme: minutos,
            alarme_em: c.alarme_em,
          });
        }
      }
    }
  }

  return predicoes;
}

function getUltimasLeituras(): Record<string, number> {
  const agora = new Date();
  const inicio = new Date(agora.getTime() - 15000);
  const dados = store.registrosPorPeriodo(inicio, agora);
  const leituras: Record<string, number> = {};
  const vistos = new Set<string>();

  for (const r of dados) {
    const chave = mapTopico(r.topico);
    if (!vistos.has(chave)) {
      vistos.add(chave);
      leituras[chave] = r.valor;
    }

    const ts = new Date(r.timestamp).getTime();
    if (r.topico === "transformador/nucleo/temperatura") pushWindow(histTemp, ts, r.valor);
    if (r.topico === "transformador/nucleo/delta_t") pushWindow(histDeltaT, ts, r.valor);
    if (r.topico === "transformador/primario/corrente") pushWindow(histCorrente, ts, r.valor);
    if (r.topico === "transformador/vibracao/fft_120hz") pushWindow(histVib120, ts, r.valor);
  }

  return leituras;
}

export function executarDiagnostico(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const leituras = getUltimasLeituras();

    if (!leituras.temperatura && !leituras.delta_t && !leituras["vibracao_120hz"]) {
      resolve({
        timestamp: Date.now() / 1000,
        risco_operacional: { score: 0, nivel: "baixo", termos: {} },
        urgencia_intervencao: { score: 0, nivel: "baixa" },
        diagnosticos: [],
        grandezas_criticas: [],
        severidade_geral: "ok",
        vida_residual: null,
        tendencias: [],
        predicoes: [],
      });
      return;
    }

    // Arrhenius life accumulator
    const tempAtual = leituras.temperatura ?? 0;
    const agora = Date.now() / 1000;
    if (ultimoTsVida > 0 && tempAtual > 0) {
      const dtHoras = (agora - ultimoTsVida) / 3600;
      vidaConsumida += dtHoras * agingRate(tempAtual) * 0.0002;
      vidaConsumida = Math.min(1, vidaConsumida);
    }
    if (ultimoTsVida === 0 && tempAtual > 0) vidaConsumida = 0.02;
    ultimoTsVida = agora;

    const vidaResidual = {
      consumido: Math.min(100, Math.round(vidaConsumida * 1000) / 10),
      taxa_atual: Math.round(agingRate(tempAtual) * 1000) / 1000,
    };

    const correlacao_cv = calcCorrelacaoCV();
    const tendencias = calcTendencias();
    const predicoes = calcPredicoes();

    const inputData: Record<string, number | undefined | null> = {
      timestamp: Date.now() / 1000,
      temperatura: leituras.temperatura ?? null,
      delta_t: leituras.delta_t ?? null,
      vibracao_120hz: leituras["vibracao_120hz"] ?? null,
      vibracao_240hz: leituras["vibracao_240hz"] ?? null,
      corrente_primario: leituras["corrente_primario"] ?? null,
      corrente_secundario: leituras["corrente_secundario"] ?? null,
      correlacao_cv: correlacao_cv > 0 ? correlacao_cv : null,
      vida_consumida: vidaConsumida > 0 ? vidaConsumida : null,
    };

    const proc = spawn("python3", [PYTHON_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Diagnóstico falhou (código ${code}): ${stderr}`));
        return;
      }
      try {
        const resultado = JSON.parse(stdout);
        resultado.vida_residual = vidaResidual;
        resultado.tendencias = tendencias;
        resultado.predicoes = predicoes;
        resolve(resultado);
      } catch {
        reject(new Error(`Resposta inválida do diagnóstico: ${stdout}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Erro ao executar diagnóstico: ${err.message}`));
    });

    proc.stdin.write(JSON.stringify(inputData));
    proc.stdin.end();
  });
}

router.post("/", async (_req, res) => {
  try {
    const resultado = await executarDiagnostico();
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ erro: err instanceof Error ? err.message : "Erro desconhecido" });
  }
});

export default router;
