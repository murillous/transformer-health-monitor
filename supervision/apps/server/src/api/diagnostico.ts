import { Router } from "express";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import { store } from "../db/store";

const router = Router();

const PYTHON_SCRIPT = path.resolve(__dirname, "../../../intelligence/main.py");
const PYTHON_BIN = process.platform === "win32" ? "python" : "python3";

// === Processo Python persistente (daemon) ===
// Spawna uma vez, reutiliza em todos os ciclos. Elimina ~150ms de startup/ciclo.

type Resolver = { resolve: (s: string) => void; reject: (e: Error) => void };

let pyProc: ChildProcess | null = null;
let stdoutBuf = "";
const pending: Resolver[] = [];

function spawnPy(): void {
  const proc = spawn(PYTHON_BIN, [PYTHON_SCRIPT], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });

  proc.stdout!.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      pending.shift()?.resolve(line);
    }
  });

  proc.stderr!.on("data", (data: Buffer) => {
    console.error("[intelligence]", data.toString().trimEnd());
  });

  proc.on("exit", (code) => {
    console.warn(`[intelligence] processo encerrou (código ${code}), reiniciando em 1s...`);
    pyProc = null;
    const err = new Error(`Processo Python encerrou (código ${code})`);
    for (const r of pending.splice(0)) r.reject(err);
    setTimeout(spawnPy, 1000);
  });

  pyProc = proc;
  console.log("[intelligence] processo Python iniciado");
}

function callPy(input: Record<string, number | null | undefined>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!pyProc || pyProc.stdin!.destroyed) {
      reject(new Error("Processo Python não disponível"));
      return;
    }
    pending.push({
      resolve: (line) => {
        try { resolve(JSON.parse(line)); }
        catch { reject(new Error(`Resposta inválida do diagnóstico: ${line}`)); }
      },
      reject,
    });
    pyProc.stdin!.write(JSON.stringify(input) + "\n");
  });
}

spawnPy();

const MAPA: Record<string, string> = {
  "transformador/nucleo/temperatura": "temperatura",
  "transformador/nucleo/delta_t": "delta_t",
  "transformador/vibracao/fft_120hz": "vibracao_120hz",
  "transformador/vibracao/fft_240hz": "vibracao_240hz",
  "transformador/primario/corrente": "corrente_primario",
  "transformador/secundario/corrente": "corrente_secundario",
  "transformador/primario/inrush": "inrush",
};

function mapTopico(topico: string): string {
  return MAPA[topico] ?? topico;
}
const LIMIARES: Record<string, { critico: number; aviso: number }> = {
  temperatura: { critico: 85, aviso: 65 },
  delta_t: { critico: 30, aviso: 18 },
  vibracao_120hz: { critico: 11, aviso: 7 },
  vibracao_240hz: { critico: 7, aviso: 3.5 },
};

const HIST_MAX = 30;
const histTemp: { ts: number; valor: number }[] = [];
const histDeltaT: { ts: number; valor: number }[] = [];
const histCorrenteP: { ts: number; valor: number }[] = [];
const histCorrenteS: { ts: number; valor: number }[] = [];
const histVib120: { ts: number; valor: number }[] = [];
const histVib240: { ts: number; valor: number }[] = [];

let vidaConsumida = 0;
let ultimoTsVida = 0;

// Throttle do alarme de eficiência — evita flood
let ultimoAlarmeEficienciaMs = 0;
const THROTTLE_EFICIENCIA_MS = 60_000;

interface DiagnosticoCustom {
  tipo: string;
  severidade: string;
  titulo: string;
  mensagem: string;
  recomendacao: string;
  grandeza: string;
  valor_atual: number | null;
}

// Detecta ΔT subindo sem aumento proporcional de carga (perdas no núcleo,
// conexões, refrigeração comprometida). Retorna diagnóstico custom ou null.
function detectarEficienciaAnomala(
  deltaTAtual: number,
  tendencias: ReturnType<typeof calcTendencias>
): DiagnosticoCustom | null {
  const tDeltaT = tendencias.find((t) => t.grandeza === "delta_t");
  const tCorrS = tendencias.find((t) => t.grandeza === "corrente_secundario");
  if (!tDeltaT || !tCorrS) return null;

  const subindoDeltaT = tDeltaT.inclinacao > 1.0;
  const cargaEstavel = Math.abs(tCorrS.inclinacao) < 1.0;
  const deltaTRelevante = deltaTAtual > LIMIARES.delta_t.aviso;

  if (!(subindoDeltaT && cargaEstavel && deltaTRelevante)) return null;

  return {
    tipo: "eficiencia_anomala",
    severidade: "aviso",
    titulo: "Anomalia de Eficiência",
    mensagem:
      "ΔT subindo sem aumento proporcional de carga — possível perda no núcleo, conexões frouxas ou refrigeração comprometida.",
    recomendacao:
      "Inspecionar conexões/aperto das chapas do núcleo, verificar fluxo de óleo/ar de refrigeração e analisar perdas a vazio.",
    grandeza: "delta_t",
    valor_atual: deltaTAtual,
  };
}

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

// === Adaptive baseline (z-score) from DB history ===
function getAdaptiveBaselines(): Record<string, { media: number; std: number }> {
  const agora = new Date();
  const inicio = new Date(agora.getTime() - 300000);
  const dados = store.registrosPorPeriodo(inicio, agora);
  const grupos: Record<string, number[]> = {};
  for (const r of dados) {
    const chave = mapTopico(r.topico);
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(r.valor);
  }
  const result: Record<string, { media: number; std: number }> = {};
  for (const [chave, valores] of Object.entries(grupos)) {
    if (valores.length < 10) continue;
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const variancia = valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length;
    result[chave] = { media: Math.round(media * 100) / 100, std: Math.round(Math.sqrt(variancia) * 100) / 100 };
  }
  return result;
}

function calcCorrelacaoCV(): number {
  if (histCorrenteP.length < 5 || histVib120.length < 5) return 0;
  const cutoff = Date.now() - 20000;
  const recC = histCorrenteP.filter((p) => p.ts > cutoff).map((p) => p.valor);
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
  unidade: string;
  inclinacao: number;
  direcao: string;
  aceleracao: string;
}> {
  const metricas: Array<{ hist: { ts: number; valor: number }[]; grandeza: string; label: string; unidade: string }> = [
    { hist: histTemp, grandeza: "temperatura", label: "Temperatura", unidade: "°C/h" },
    { hist: histDeltaT, grandeza: "delta_t", label: "ΔT", unidade: "°C/h" },
    { hist: histCorrenteP, grandeza: "corrente_primario", label: "Corrente P", unidade: "A/h" },
    { hist: histCorrenteS, grandeza: "corrente_secundario", label: "Corrente S", unidade: "A/h" },
    { hist: histVib120, grandeza: "vibracao_120hz", label: "Vibração 120Hz", unidade: "g/h" },
    { hist: histVib240, grandeza: "vibracao_240hz", label: "Vibração 240Hz", unidade: "g/h" },
  ];

  return metricas.map((m) => {
    const trend = linearRegression(m.hist);
    const inclinacao = Math.round(trend.inclinacao * 100) / 100;
    const direcao = Math.abs(inclinacao) < 0.1 ? "estavel" : inclinacao > 0 ? "subindo" : "descendo";
    // 2nd derivative: split history, compare first-half vs second-half slopes
    const metade = Math.floor(m.hist.length / 2);
    const primeiraMetade = m.hist.slice(0, metade);
    const segundaMetade = m.hist.slice(metade);
    const incl1 = linearRegression(primeiraMetade).inclinacao;
    const incl2 = linearRegression(segundaMetade).inclinacao;
    const dif = incl2 - incl1;
    const aceleracao = Math.abs(dif) < 0.05 ? "constante" : dif > 0 ? "acelerando" : "desacelerando";
    return { grandeza: m.grandeza, label: m.label, unidade: m.unidade, inclinacao, direcao, aceleracao };
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
    if (r.topico === "transformador/primario/corrente") pushWindow(histCorrenteP, ts, r.valor);
    if (r.topico === "transformador/secundario/corrente") pushWindow(histCorrenteS, ts, r.valor);
    if (r.topico === "transformador/vibracao/fft_120hz") pushWindow(histVib120, ts, r.valor);
    if (r.topico === "transformador/vibracao/fft_240hz") pushWindow(histVib240, ts, r.valor);
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
        baseline: null,
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
    const baselines = getAdaptiveBaselines();

    // Harmonic ratio: vib240 / vib120 (high = harmonic distortion)
    const v120 = leituras["vibracao_120hz"] ?? 0;
    const v240 = leituras["vibracao_240hz"] ?? 0;
    const harmonicRatio = v120 > 0.01 ? Math.round((v240 / v120) * 100) / 100 : 0;

    // Z-scores: how many std above/below adaptive baseline
    const zTemperatura = baselines.temperatura?.std > 0
      ? Math.round(((leituras.temperatura ?? 0) - baselines.temperatura.media) / baselines.temperatura.std * 10) / 10
      : 0;
    const zDeltaT = baselines.delta_t?.std > 0
      ? Math.round(((leituras.delta_t ?? 0) - baselines.delta_t.media) / baselines.delta_t.std * 10) / 10
      : 0;
    const zCorrenteP = baselines.corrente_primario?.std > 0
      ? Math.round(((leituras["corrente_primario"] ?? 0) - baselines.corrente_primario.media) / baselines.corrente_primario.std * 10) / 10
      : 0;
    const zVib120 = baselines.vibracao_120hz?.std > 0
      ? Math.round(((leituras["vibracao_120hz"] ?? 0) - baselines.vibracao_120hz.media) / baselines.vibracao_120hz.std * 10) / 10
      : 0;

    // Acceleration flags for meta-diagnosis
    const tempAcelerando = tendencias.find(t => t.grandeza === "temperatura")?.aceleracao === "acelerando";

    const inputData: Record<string, number | undefined | null> = {
      timestamp: Date.now() / 1000,
      temperatura: leituras.temperatura ?? null,
      delta_t: leituras.delta_t ?? null,
      vibracao_120hz: v120 || null,
      vibracao_240hz: v240 || null,
      corrente_primario: leituras["corrente_primario"] ?? null,
      corrente_secundario: leituras["corrente_secundario"] ?? null,
      // Inrush e evento discreto. Quando nao ha pico recente, leitura nao
      // aparece nos ultimos 15s -> Python recebe null -> default 0 -> "ausente".
      inrush: leituras["inrush"] ?? null,
      correlacao_cv: correlacao_cv > 0 ? correlacao_cv : null,
      vida_consumida: vidaConsumida > 0 ? vidaConsumida : null,
      harmonic_ratio: harmonicRatio > 0 ? harmonicRatio : null,
      z_temperatura: zTemperatura !== 0 ? zTemperatura : null,
      z_delta_t: zDeltaT !== 0 ? zDeltaT : null,
      z_corrente_p: zCorrenteP !== 0 ? zCorrenteP : null,
      z_vib120: zVib120 !== 0 ? zVib120 : null,
      temp_acelerando: tempAcelerando ? 1 : 0,
    };

    callPy(inputData).then((resultado: unknown) => {
      const r = resultado as Record<string, unknown>;
      r.vida_residual = vidaResidual;
      r.tendencias = tendencias;
      r.predicoes = predicoes;
      r.baseline = baselines;

      // Detector ΔT × carga — adiciona diagnóstico custom + alarme throttled
      const deltaTAtual = leituras.delta_t ?? 0;
      const eficienciaDiag = detectarEficienciaAnomala(deltaTAtual, tendencias);
      if (eficienciaDiag) {
        if (!Array.isArray(r.diagnosticos)) r.diagnosticos = [];
        (r.diagnosticos as unknown[]).push(eficienciaDiag);

        if (!Array.isArray(r.grandezas_criticas)) r.grandezas_criticas = [];
        if (!(r.grandezas_criticas as string[]).includes("delta_t")) {
          (r.grandezas_criticas as string[]).push("delta_t");
        }
        if (r.severidade_geral === "ok") r.severidade_geral = "aviso";

        const agoraMs = Date.now();
        if (agoraMs - ultimoAlarmeEficienciaMs > THROTTLE_EFICIENCIA_MS) {
          ultimoAlarmeEficienciaMs = agoraMs;
          store.pushAlarme({
            ts: Math.floor(agoraMs / 1000),
            tipo: "eficiencia",
            sev: "aviso",
            valor: deltaTAtual,
            limite: LIMIARES.delta_t.aviso,
          });
        }
      }

      resolve(r);
    }).catch(reject);
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
