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

function callPy(input: Record<string, unknown>): Promise<unknown> {
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
const LIMIAR_DELTA_T_AVISO = 18;

const HIST_MAX = 30;
const histTemp: { ts: number; valor: number }[] = [];
const histDeltaT: { ts: number; valor: number }[] = [];
const histCorrenteP: { ts: number; valor: number }[] = [];
const histCorrenteS: { ts: number; valor: number }[] = [];
const histVib120: { ts: number; valor: number }[] = [];
const histVib240: { ts: number; valor: number }[] = [];

// Throttle do alarme de eficiência — a regra roda no Python, o save no DB fica aqui
let ultimoAlarmeEficienciaMs = 0;
const THROTTLE_EFICIENCIA_MS = 60_000;

function pushWindow(arr: { ts: number; valor: number }[], ts: number, valor: number): void {
  arr.push({ ts, valor });
  if (arr.length > HIST_MAX) arr.shift();
}

function histToSeries(hist: { ts: number; valor: number }[]): [number, number][] {
  return hist.map((p) => [p.ts / 1000, p.valor]);
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
        diagnosticos: [], grandezas_criticas: [], severidade_geral: "ok",
        vida_residual: null, tendencias: [], predicoes: [], baseline: null,
      });
      return;
    }

    const payload = {
      timestamp: Date.now() / 1000,
      leituras: {
        temperatura:          leituras.temperatura          ?? null,
        delta_t:              leituras.delta_t              ?? null,
        vibracao_120hz:       leituras["vibracao_120hz"]    ?? null,
        vibracao_240hz:       leituras["vibracao_240hz"]    ?? null,
        corrente_primario:    leituras["corrente_primario"] ?? null,
        corrente_secundario:  leituras["corrente_secundario"] ?? null,
        // Inrush é evento discreto — null quando ausente nos últimos 15s
        inrush:               leituras["inrush"]            ?? null,
      },
      series: {
        temperatura:          histToSeries(histTemp),
        delta_t:              histToSeries(histDeltaT),
        corrente_primario:    histToSeries(histCorrenteP),
        corrente_secundario:  histToSeries(histCorrenteS),
        vibracao_120hz:       histToSeries(histVib120),
        vibracao_240hz:       histToSeries(histVib240),
      },
    };

    callPy(payload).then((resultado: unknown) => {
      const r = resultado as Record<string, unknown>;

      // Salva alarme de eficiência no DB com throttle (regra detectada no Python)
      const diags = r.diagnosticos as Array<{ tipo: string; valor_atual?: number }> ?? [];
      const efic = diags.find((d) => d.tipo === "eficiencia_anomala");
      if (efic) {
        const agoraMs = Date.now();
        if (agoraMs - ultimoAlarmeEficienciaMs > THROTTLE_EFICIENCIA_MS) {
          ultimoAlarmeEficienciaMs = agoraMs;
          store.pushAlarme({
            ts: Math.floor(agoraMs / 1000),
            tipo: "eficiencia",
            sev: "aviso",
            valor: efic.valor_atual ?? 0,
            limite: LIMIAR_DELTA_T_AVISO,
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
