import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import { store } from "../db/store";

const router = Router();

const PYTHON_SCRIPT = path.resolve(__dirname, "../../../intelligence/main.py");

function getUltimasLeituras(): Record<string, number> {
  const agora = new Date();
  const inicio = new Date(agora.getTime() - 10000);
  const dados = store.registrosPorPeriodo(inicio, agora);
  const leituras: Record<string, number> = {};
  const vistos = new Set<string>();

  for (const r of dados) {
    const chave = mapTopico(r.topico);
    if (!vistos.has(chave)) {
      vistos.add(chave);
      leituras[chave] = r.valor;
    }
  }

  return leituras;
}

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

function mapReverse(grandeza: string): string | undefined {
  for (const [topico, g] of Object.entries(MAPA)) {
    if (g === grandeza) return topico;
  }
  return undefined;
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
      });
      return;
    }

    const inputData: Record<string, number | undefined | null> = {
      timestamp: Date.now() / 1000,
      temperatura: leituras.temperatura ?? null,
      delta_t: leituras.delta_t ?? null,
      vibracao_120hz: leituras["vibracao_120hz"] ?? null,
      vibracao_240hz: leituras["vibracao_240hz"] ?? null,
      corrente_primario: leituras["corrente_primario"] ?? null,
      corrente_secundario: leituras["corrente_secundario"] ?? null,
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
