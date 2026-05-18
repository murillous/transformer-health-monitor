import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import { store } from "../db/store";

const router = Router();

const PYTHON_SCRIPT = path.resolve(__dirname, "../../../intelligence/main.py");
const PYTHON_BIN = process.platform === "win32" ? "python" : "python3";

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

const TOPICOS = Object.entries(MAPA).reduce<Record<string, string>>((acc, [k, v]) => {
  acc[v] = k;
  return acc;
}, {});

const LIMIARES: Record<string, { critico: number; aviso: number }> = {
  temperatura: { critico: 85, aviso: 70 },
  delta_t: { critico: 30, aviso: 18 },
  vibracao_120hz: { critico: 0.45, aviso: 0.20 },
  vibracao_240hz: { critico: 0.25, aviso: 0.10 },
  corrente_primario: { critico: 6.0, aviso: 4.0 },
  corrente_secundario: { critico: 45, aviso: 30 },
};

// In-memory: sliding windows for trend + correlation
const HIST_MAX = 30;
const histTemp: { ts: number; valor: number }[] = [];
const histDeltaT: { ts: number; valor: number }[] = [];
const histCorrenteP: { ts: number; valor: number }[] = [];
const histCorrenteS: { ts: number; valor: number }[] = [];
const histVib120: { ts: number; valor: number }[] = [];
const histVib240: { ts: number; valor: number }[] = [];

// Cache do último espectro FFT (alimentado pelo subscriber MQTT e simulador).
// Usado pra calcular razão harmônica e THD como inputs fuzzy.
let ultimoEspectro: { freq: number; amplitude: number }[] = [];
export function atualizarEspectro(bins: { freq: number; amplitude: number }[]): void {
  if (Array.isArray(bins)) ultimoEspectro = bins;
}

function calcRatioHarmonicas(): number {
  const v120 = ultimoEspectro.find((b) => b.freq === 120)?.amplitude ?? 0;
  const v240 = ultimoEspectro.find((b) => b.freq === 240)?.amplitude ?? 0;
  if (v120 < 0.01) return 0;
  return Math.min(2, v240 / v120);
}

function calcTHD(): number {
  const v120 = ultimoEspectro.find((b) => b.freq === 120)?.amplitude ?? 0;
  if (v120 < 0.01) return 0;
  const harms = ultimoEspectro.filter((b) => [240, 360, 480, 600].includes(b.freq));
  const soma = Math.sqrt(harms.reduce((s, b) => s + b.amplitude * b.amplitude, 0));
  return Math.min(1, soma / v120);
}

// Eventos de inrush nos últimos 5 min — feed do subscriber e simulador.
const eventosInrush: number[] = [];
export function registrarInrush(): void {
  const agora = Date.now();
  eventosInrush.push(agora);
  const cutoff = agora - 5 * 60_000;
  while (eventosInrush.length > 0 && eventosInrush[0] < cutoff) {
    eventosInrush.shift();
  }
}
function calcTaxaInrush(): number {
  return eventosInrush.length;
}

// Arrhenius accumulator (in-memory)
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

  // Inclinações já em unidade/hora (multiplicação por 3600 em linearRegression)
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
    return { grandeza: m.grandeza, label: m.label, unidade: m.unidade, inclinacao, direcao };
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

  // Cada check tem slopeMin proporcional à escala da grandeza (vib120 sobe em
  // décimos de g/h, corrente em A/h, temperatura em dezenas de °C/h).
  const checks: Array<{
    hist: { ts: number; valor: number }[];
    grandeza: string;
    label: string;
    threshold: number;
    alarme_em: string;
    slopeMin: number;
  }> = [
    { hist: histTemp, grandeza: "temperatura", label: "Temperatura", threshold: LIMIARES.temperatura.critico, alarme_em: "critico", slopeMin: 0.3 },
    { hist: histTemp, grandeza: "temperatura", label: "Temperatura", threshold: LIMIARES.temperatura.aviso, alarme_em: "aviso", slopeMin: 0.3 },
    { hist: histDeltaT, grandeza: "delta_t", label: "ΔT", threshold: LIMIARES.delta_t.critico, alarme_em: "critico", slopeMin: 0.2 },
    { hist: histDeltaT, grandeza: "delta_t", label: "ΔT", threshold: LIMIARES.delta_t.aviso, alarme_em: "aviso", slopeMin: 0.2 },
    { hist: histCorrenteP, grandeza: "corrente_primario", label: "Corrente P", threshold: LIMIARES.corrente_primario.critico, alarme_em: "critico", slopeMin: 0.1 },
    { hist: histCorrenteP, grandeza: "corrente_primario", label: "Corrente P", threshold: LIMIARES.corrente_primario.aviso, alarme_em: "aviso", slopeMin: 0.1 },
    { hist: histCorrenteS, grandeza: "corrente_secundario", label: "Corrente S", threshold: LIMIARES.corrente_secundario.critico, alarme_em: "critico", slopeMin: 0.5 },
    { hist: histCorrenteS, grandeza: "corrente_secundario", label: "Corrente S", threshold: LIMIARES.corrente_secundario.aviso, alarme_em: "aviso", slopeMin: 0.5 },
    { hist: histVib120, grandeza: "vibracao_120hz", label: "Vibração 120Hz", threshold: LIMIARES.vibracao_120hz.critico, alarme_em: "critico", slopeMin: 0.02 },
    { hist: histVib120, grandeza: "vibracao_120hz", label: "Vibração 120Hz", threshold: LIMIARES.vibracao_120hz.aviso, alarme_em: "aviso", slopeMin: 0.02 },
  ];

  // Dedup: só emite a 1ª predição (mais próxima do limiar) por grandeza.
  const grandezasVistas = new Set<string>();
  for (const c of checks) {
    if (grandezasVistas.has(c.grandeza)) continue;
    const trend = linearRegression(c.hist);
    if (trend.inclinacao > c.slopeMin && trend.r2 > 0.3) {
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
            inclinacao: Math.round(trend.inclinacao * 100) / 100,
            tempo_para_alarme: minutos,
            alarme_em: c.alarme_em,
          });
          grandezasVistas.add(c.grandeza);
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

    // Mapeia slopes calculados em calcTendencias() pra inputs fuzzy do Python.
    // Permite regras antecipatorias (temp morna + subindo -> moderado).
    const tendenciaMap = Object.fromEntries(
      tendencias.map((t) => [t.grandeza, t.inclinacao])
    );

    const inputData: Record<string, number | undefined | null> = {
      timestamp: Date.now() / 1000,
      temperatura: leituras.temperatura ?? null,
      delta_t: leituras.delta_t ?? null,
      vibracao_120hz: leituras["vibracao_120hz"] ?? null,
      vibracao_240hz: leituras["vibracao_240hz"] ?? null,
      corrente_primario: leituras["corrente_primario"] ?? null,
      corrente_secundario: leituras["corrente_secundario"] ?? null,
      // Inrush e evento discreto. Quando nao ha pico recente, leitura nao
      // aparece nos ultimos 15s -> Python recebe null -> default 0 -> "ausente".
      inrush: leituras["inrush"] ?? null,
      correlacao_cv: correlacao_cv > 0 ? correlacao_cv : null,
      vida_consumida: vidaConsumida > 0 ? vidaConsumida : null,
      // Novos inputs (Iteração 3): tendência, harmônicas, taxa inrush.
      tendencia_temperatura: tendenciaMap.temperatura ?? null,
      tendencia_delta_t: tendenciaMap.delta_t ?? null,
      ratio_harmonicas: calcRatioHarmonicas() || null,
      thd: calcTHD() || null,
      taxa_inrush: calcTaxaInrush() || null,
    };

    const proc = spawn(PYTHON_BIN, [PYTHON_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      // Garante UTF-8 no stdout do Python (Windows usa cp1252 por default em
      // pipes nao-TTY, o que quebra caracteres como Δ e acentos das mensagens).
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
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

        // Detector ΔT × carga — adiciona diagnóstico custom + alarme throttled
        const deltaTAtual = leituras.delta_t ?? 0;
        const eficienciaDiag = detectarEficienciaAnomala(deltaTAtual, tendencias);
        if (eficienciaDiag) {
          if (!Array.isArray(resultado.diagnosticos)) resultado.diagnosticos = [];
          resultado.diagnosticos.push(eficienciaDiag);

          if (!Array.isArray(resultado.grandezas_criticas)) resultado.grandezas_criticas = [];
          if (!resultado.grandezas_criticas.includes("delta_t")) {
            resultado.grandezas_criticas.push("delta_t");
          }
          if (resultado.severidade_geral === "ok") resultado.severidade_geral = "aviso";

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
