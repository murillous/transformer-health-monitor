import { Router } from "express";
import puppeteer from "puppeteer";
import { store } from "../db/store";
import {
  avaliarSeveridade,
  mapearGrandeza,
  LIMITES,
} from "@transformer-monitor/shared";
import { executarDiagnostico } from "./diagnostico";

const router = Router();

interface DiagnosticoFuzzy {
  diagnosticos?: Array<{
    tipo: string;
    severidade: string;
    titulo: string;
    mensagem: string;
    recomendacao: string;
    grandeza: string;
    valor_atual: number | null;
  }>;
  severidade_geral?: string;
  risco_operacional?: { score: number; nivel: string };
  urgencia_intervencao?: { score: number; nivel: string };
  vida_residual?: { consumido: number; taxa_atual: number } | null;
}

const LABELS: Record<string, string> = {
  "transformador/nucleo/temperatura": "Temperatura do Núcleo",
  "transformador/nucleo/delta_t": "ΔT (Gradiente Térmico)",
  "transformador/primario/corrente": "Corrente do Primário",
  "transformador/secundario/corrente": "Corrente do Secundário",
  "transformador/vibracao/fft_120hz": "Vibração 120Hz",
  "transformador/vibracao/fft_240hz": "Vibração 240Hz",
};

const CORES: Record<string, string> = {
  "transformador/nucleo/temperatura": "#ef4444",
  "transformador/nucleo/delta_t": "#f97316",
  "transformador/primario/corrente": "#3b82f6",
  "transformador/secundario/corrente": "#10b981",
  "transformador/vibracao/fft_120hz": "#f59e0b",
  "transformador/vibracao/fft_240hz": "#8b5cf6",
};

function rotular(topico: string): string {
  return LABELS[topico] ?? topico;
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function amostrar<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const passo = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * passo)]);
}

function gerarChartLinhaSVG(
  pontos: { ts: number; valor: number }[],
  largura: number,
  altura: number,
  cor: string,
  label: string,
  unidade: string
): string {
  if (pontos.length < 2) return "";
  const amostras = amostrar(pontos, 80);
  const valores = amostras.map((p) => p.valor);
  const minVal = Math.min(...valores);
  const maxVal = Math.max(...valores);
  const range = maxVal - minVal || 1;

  const pad = { top: 24, right: 12, bottom: 28, left: 48 };
  const plotW = largura - pad.left - pad.right;
  const plotH = altura - pad.top - pad.bottom;

  const pathD = amostras
    .map((p, i) => {
      const x = pad.left + (i / (amostras.length - 1)) * plotW;
      const y = pad.top + plotH - ((p.valor - minVal) / range) * plotH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const ticksY = 5;
  const eixoTicks: string[] = [];
  const gridLines: string[] = [];
  for (let i = 0; i < ticksY; i++) {
    const val = minVal + (range * i) / (ticksY - 1);
    const y = pad.top + plotH - (i / (ticksY - 1)) * plotH;
    gridLines.push(
      `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${largura - pad.right}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/>`
    );
    eixoTicks.push(
      `<text x="${pad.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="#6b7280">${val.toFixed(1)}</text>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
    <text x="${largura / 2}" y="14" text-anchor="middle" font-size="11" font-weight="bold" fill="#374151">${label}</text>
    ${gridLines.join("\n    ")}
    ${eixoTicks.join("\n    ")}
    <path d="${pathD}" fill="none" stroke="${cor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function gerarChartBarraSVG(
  dados: { freq: number; amplitude: number }[],
  largura: number,
  altura: number
): string {
  if (dados.length === 0) return "";
  const maxAmp = Math.max(...dados.map((d) => d.amplitude), 0.01);
  const pad = { top: 24, right: 12, bottom: 28, left: 48 };
  const plotW = largura - pad.left - pad.right;
  const plotH = altura - pad.top - pad.bottom;
  const barW = Math.min(plotW / dados.length * 0.7, 30);
  const gap = plotW / dados.length;

  const ticksY = 4;
  const eixoTicks: string[] = [];
  const gridLines: string[] = [];
  for (let i = 0; i < ticksY; i++) {
    const val = (maxAmp * i) / (ticksY - 1);
    const y = pad.top + plotH - (i / (ticksY - 1)) * plotH;
    gridLines.push(
      `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${largura - pad.right}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/>`
    );
    eixoTicks.push(
      `<text x="${pad.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="#6b7280">${val.toFixed(2)}</text>`
    );
  }

  const barras = dados
    .map((d, i) => {
      const x = pad.left + i * gap + (gap - barW) / 2;
      const h = (d.amplitude / maxAmp) * plotH;
      const y = pad.top + plotH - h;
      const cor = d.freq === 120 ? "#ef4444" : d.freq === 240 ? "#8b5cf6" : "#f59e0b";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${cor}" rx="2"/>
        <text x="${(x + barW / 2).toFixed(1)}" y="${(pad.top + plotH + 14).toFixed(1)}" text-anchor="middle" font-size="8" fill="#6b7280">${d.freq}Hz</text>
        <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="8" fill="#374151">${d.amplitude.toFixed(3)}</text>`;
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
    <text x="${largura / 2}" y="14" text-anchor="middle" font-size="11" font-weight="bold" fill="#374151">Espectro de Vibração (FFT)</text>
    ${gridLines.join("\n    ")}
    ${eixoTicks.join("\n    ")}
    ${barras}
  </svg>`;
}

function gerarEspectro(
  vib120: number,
  vib240: number
): { freq: number; amplitude: number }[] {
  const bins = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600];
  return bins.map((freq) => {
    let amp: number;
    if (freq === 120) amp = vib120;
    else if (freq === 240) amp = vib240;
    else if (freq === 60) amp = vib120 * 0.08;
    else if (freq === 180) amp = vib120 * 0.15;
    else if (freq === 300) amp = vib240 * 0.2;
    else amp = Math.max(0, (vib120 + vib240) * 0.05 * (1 - (freq - 360) / 600));
    return { freq, amplitude: Math.round(amp * 1000) / 1000 };
  });
}

function gerarHTML(inicio: string, fim: string, diagnostico: DiagnosticoFuzzy | null): string {
  const inicioDate = new Date(inicio);
  const fimDate = new Date(fim);
  const registros = store.registrosPorPeriodo(inicioDate, fimDate);
  const alarmes = store.getAlarmes().filter((a) => {
    const t = a.ts * 1000;
    return t >= inicioDate.getTime() && t <= fimDate.getTime();
  });

  const topicosUnicos = [...new Set(registros.map((r) => r.topico))];

  interface Estatistica {
    topico: string;
    label: string;
    media: number;
    min: number;
    max: number;
    unidade: string;
    sev: string;
  }
  const estatisticas: Estatistica[] = topicosUnicos
    .map((topico) => {
      const vals = registros
        .filter((r) => r.topico === topico)
        .map((r) => r.valor);
      const media = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const grandeza = mapearGrandeza(topico);
      const sev = grandeza ? avaliarSeveridade(grandeza, media) : "ok";
      return {
        topico,
        label: rotular(topico),
        media: Math.round(media * 100) / 100,
        min: Math.round(Math.min(...vals) * 100) / 100,
        max: Math.round(Math.max(...vals) * 100) / 100,
        unidade: registros.find((r) => r.topico === topico)?.unidade ?? "",
        sev,
      };
    });

  const sevGlobal = estatisticas.some((e) => e.sev === "critico")
    ? "critico"
    : estatisticas.some((e) => e.sev === "aviso")
    ? "aviso"
    : "ok";

  const statusCor = sevGlobal === "critico" ? "#ef4444" : sevGlobal === "aviso" ? "#f59e0b" : "#22c55e";
  const statusLabel = sevGlobal === "critico" ? "CRÍTICO" : sevGlobal === "aviso" ? "ATENÇÃO" : "NORMAL";

  const mediasHTML = estatisticas
    .map(
      (e) => `<tr>
    <td>${e.label}</td>
    <td>${e.media} ${e.unidade}</td>
    <td>${e.min} ${e.unidade}</td>
    <td>${e.max} ${e.unidade}</td>
    <td style="color:${e.sev === "critico" ? "#ef4444" : e.sev === "aviso" ? "#f59e0b" : "#22c55e"}; font-weight:600">${e.sev === "critico" ? "CRÍTICO" : e.sev === "aviso" ? "ATENÇÃO" : "OK"}</td>
  </tr>`
    )
    .join("");

  const linhasDiagnostico = estatisticas
    .filter((e) => e.sev !== "ok")
    .map((e) => {
      const grandeza = mapearGrandeza(e.topico);
      const lim = grandeza ? LIMITES[grandeza] : null;
      return `<tr>
    <td>${e.label}</td>
    <td>${e.media} ${e.unidade}</td>
    <td style="color:${e.sev === "critico" ? "#ef4444" : "#f59e0b"}; font-weight:bold">${e.sev === "critico" ? "CRÍTICO" : "ATENÇÃO"}</td>
    <td>${lim ? `${e.sev === "critico" ? "Acima de " + lim.critico : "Acima de " + lim.aviso} ${e.unidade}` : "-"}</td>
  </tr>`;
    })
    .join("");

  const charts: string[] = [];

  const topicosChart = [
    "transformador/nucleo/temperatura",
    "transformador/nucleo/delta_t",
  ];
  for (const topico of topicosChart) {
    const pts = registros
      .filter((r) => r.topico === topico)
      .map((r) => ({ ts: new Date(r.timestamp).getTime(), valor: r.valor }))
      .sort((a, b) => a.ts - b.ts);
    if (pts.length > 0) {
      charts.push(
        gerarChartLinhaSVG(pts, 600, 180, CORES[topico] ?? "#666", LABELS[topico] ?? topico, pts[0]?.valor !== undefined ? (registros.find(r => r.topico === topico)?.unidade ?? "") : "")
      );
    }
  }

  const topicosChart2 = [
    "transformador/primario/corrente",
    "transformador/secundario/corrente",
  ];
  const ptsPrimario = registros
    .filter((r) => r.topico === "transformador/primario/corrente")
    .map((r) => ({ ts: new Date(r.timestamp).getTime(), valor: r.valor }))
    .sort((a, b) => a.ts - b.ts);
  const ptsSecundario = registros
    .filter((r) => r.topico === "transformador/secundario/corrente")
    .map((r) => ({ ts: new Date(r.timestamp).getTime(), valor: r.valor }))
    .sort((a, b) => a.ts - b.ts);
  if (ptsPrimario.length > 0 && ptsSecundario.length > 0) {
    const todos = [...ptsPrimario, ...ptsSecundario];
    const minTs = Math.min(...todos.map((p) => p.ts));
    const maxTs = Math.max(...todos.map((p) => p.ts));
    const rangeTs = maxTs - minTs || 1;
    const altura = 180;
    const largura = 600;
    const pad = { top: 24, right: 12, bottom: 28, left: 48 };
    const plotW = largura - pad.left - pad.right;
    const plotH = altura - pad.top - pad.bottom;
    const todosVal = [...ptsPrimario.map((p) => p.valor), ...ptsSecundario.map((p) => p.valor)];
    const minVal = Math.min(...todosVal);
    const maxVal = Math.max(...todosVal);
    const rangeVal = maxVal - minVal || 1;

    function path(pts: { ts: number; valor: number }[], cor: string) {
      const amostras = amostrar(pts, 80);
      const d = amostras
        .map((p, i) => {
          const x = pad.left + ((p.ts - minTs) / rangeTs) * plotW;
          const y = pad.top + plotH - ((p.valor - minVal) / rangeVal) * plotH;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${cor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    }

    const ticksY = 5;
    const eixoT: string[] = [];
    const gridL: string[] = [];
    for (let i = 0; i < ticksY; i++) {
      const val = minVal + (rangeVal * i) / (ticksY - 1);
      const y = pad.top + plotH - (i / (ticksY - 1)) * plotH;
      gridL.push(
        `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${largura - pad.right}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/>`
      );
      eixoT.push(
        `<text x="${pad.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="#6b7280">${val.toFixed(1)}</text>`
      );
    }

    const legenda = `<rect x="${largura - 160}" y="6" width="150" height="32" rx="4" fill="#f9fafb" stroke="#e5e7eb" stroke-width="0.5"/>
      <rect x="${largura - 152}" y="12" width="8" height="8" rx="1" fill="${CORES["transformador/primario/corrente"]}"/>
      <text x="${largura - 140}" y="20" font-size="9" fill="#374151">Primário (A)</text>
      <rect x="${largura - 152}" y="24" width="8" height="8" rx="1" fill="${CORES["transformador/secundario/corrente"]}"/>
      <text x="${largura - 140}" y="32" font-size="9" fill="#374151">Secundário (A)</text>`;

    charts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
      <text x="${largura / 2}" y="14" text-anchor="middle" font-size="11" font-weight="bold" fill="#374151">Correntes (A)</text>
      ${gridL.join("\n      ")}
      ${eixoT.join("\n      ")}
      ${path(ptsPrimario, CORES["transformador/primario/corrente"])}
      ${path(ptsSecundario, CORES["transformador/secundario/corrente"])}
      ${legenda}
    </svg>`
    );
  }

  const ptsVib120 = registros
    .filter((r) => r.topico === "transformador/vibracao/fft_120hz")
    .map((r) => ({ ts: new Date(r.timestamp).getTime(), valor: r.valor }))
    .sort((a, b) => a.ts - b.ts);
  const ptsVib240 = registros
    .filter((r) => r.topico === "transformador/vibracao/fft_240hz")
    .map((r) => ({ ts: new Date(r.timestamp).getTime(), valor: r.valor }))
    .sort((a, b) => a.ts - b.ts);

  if (ptsVib120.length > 0 && ptsVib240.length > 0) {
    const todos = [...ptsVib120, ...ptsVib240];
    const minTs = Math.min(...todos.map((p) => p.ts));
    const maxTs = Math.max(...todos.map((p) => p.ts));
    const rangeTs = maxTs - minTs || 1;
    const altura = 180;
    const largura = 600;
    const pad = { top: 24, right: 12, bottom: 28, left: 48 };
    const plotW = largura - pad.left - pad.right;
    const plotH = altura - pad.top - pad.bottom;
    const todosVal = [...ptsVib120.map((p) => p.valor), ...ptsVib240.map((p) => p.valor)];
    const minVal = Math.min(...todosVal);
    const maxVal = Math.max(...todosVal);
    const rangeVal = maxVal - minVal || 1;

    function path(pts: { ts: number; valor: number }[], cor: string) {
      const amostras = amostrar(pts, 80);
      const d = amostras
        .map((p, i) => {
          const x = pad.left + ((p.ts - minTs) / rangeTs) * plotW;
          const y = pad.top + plotH - ((p.valor - minVal) / rangeVal) * plotH;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${cor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    }

    const ticksY = 5;
    const eixoT: string[] = [];
    const gridL: string[] = [];
    for (let i = 0; i < ticksY; i++) {
      const val = minVal + (rangeVal * i) / (ticksY - 1);
      const y = pad.top + plotH - (i / (ticksY - 1)) * plotH;
      gridL.push(
        `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${largura - pad.right}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/>`
      );
      eixoT.push(
        `<text x="${pad.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="#6b7280">${val.toFixed(2)}</text>`
      );
    }

    const legenda = `<rect x="${largura - 160}" y="6" width="150" height="32" rx="4" fill="#f9fafb" stroke="#e5e7eb" stroke-width="0.5"/>
      <rect x="${largura - 152}" y="12" width="8" height="8" rx="1" fill="${CORES["transformador/vibracao/fft_120hz"]}"/>
      <text x="${largura - 140}" y="20" font-size="9" fill="#374151">120Hz (g)</text>
      <rect x="${largura - 152}" y="24" width="8" height="8" rx="1" fill="${CORES["transformador/vibracao/fft_240hz"]}"/>
      <text x="${largura - 140}" y="32" font-size="9" fill="#374151">240Hz (g)</text>`;

    charts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
      <text x="${largura / 2}" y="14" text-anchor="middle" font-size="11" font-weight="bold" fill="#374151">Vibração (g)</text>
      ${gridL.join("\n      ")}
      ${eixoT.join("\n      ")}
      ${path(ptsVib120, CORES["transformador/vibracao/fft_120hz"])}
      ${path(ptsVib240, CORES["transformador/vibracao/fft_240hz"])}
      ${legenda}
    </svg>`
    );
  }

  const ultVib120 = ptsVib120.length > 0 ? ptsVib120[ptsVib120.length - 1].valor : 0;
  const ultVib240 = ptsVib240.length > 0 ? ptsVib240[ptsVib240.length - 1].valor : 0;
  const espectro = gerarEspectro(ultVib120, ultVib240);
  const barraChart = gerarChartBarraSVG(espectro, 600, 180);

  const alarmesHTML = alarmes
    .map(
      (a) => `<tr>
    <td>${new Date(a.ts * 1000).toLocaleString("pt-BR")}</td>
    <td>${rotular(a.tipo)}</td>
    <td style="color:${a.sev === "critico" ? "#ef4444" : "#f59e0b"}; font-weight:600">${a.sev === "critico" ? "CRÍTICO" : "ATENÇÃO"}</td>
    <td>${a.valor}</td>
  </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 32px 40px; color: #1f2937; font-size: 10px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1a56db; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 18px; color: #1a56db; }
  .header .meta { text-align: right; font-size: 9px; color: #6b7280; }
  .status-bar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; font-size: 11px; font-weight: bold; background: ${statusCor}11; border: 1px solid ${statusCor}33; color: ${statusCor}; }
  .status-bar .dot { width: 10px; height: 10px; border-radius: 50%; background: ${statusCor}; }
  h2 { font-size: 13px; color: #1f2937; margin: 20px 0 10px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
  h3 { font-size: 11px; color: #374151; margin: 14px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 8px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; font-size: 9px; }
  th { background: #f3f4f6; font-weight: 700; color: #374151; }
  tr:nth-child(even) td { background: #fafafa; }
  .chart-box { text-align: center; margin: 8px 0; }
  .footer { margin-top: 28px; padding-top: 8px; border-top: 1px solid #d1d5db; font-size: 8px; color: #9ca3af; text-align: center; }
  .page-break { page-break-before: always; }
  .reco { border-left: 4px solid #9ca3af; padding: 8px 12px; margin: 6px 0; background: #f9fafb; border-radius: 0 4px 4px 0; }
  .reco.critico { border-left-color: #ef4444; background: #fef2f2; }
  .reco.aviso { border-left-color: #f59e0b; background: #fffbeb; }
  .reco h4 { font-size: 10px; margin-bottom: 4px; color: #1f2937; }
  .reco h4 .tag { display: inline-block; padding: 1px 6px; font-size: 8px; border-radius: 3px; margin-left: 6px; vertical-align: middle; }
  .reco.critico h4 .tag { background: #ef4444; color: #fff; }
  .reco.aviso h4 .tag { background: #f59e0b; color: #fff; }
  .reco p { font-size: 9px; margin: 2px 0; color: #374151; }
  .reco p strong { color: #111827; }
</style></head><body>
  <div class="header">
    <div>
      <h1>Relatório de Diagnóstico</h1>
      <p style="font-size:10px;color:#6b7280;margin-top:2px">Transformer Health Monitor</p>
    </div>
    <div class="meta">
      <p>Gerado em: ${new Date().toLocaleString("pt-BR")}</p>
      <p>Período: ${fmtData(inicio)} a ${fmtData(fim)}</p>
    </div>
  </div>

  <div class="status-bar">
    <div class="dot"></div>
    <span>Status do Equipamento: ${statusLabel}</span>
  </div>

  <h2>Resumo das Grandezas</h2>
  <table>
    <thead><tr><th>Grandeza</th><th>Média</th><th>Mínimo</th><th>Máximo</th><th>Status</th></tr></thead>
    <tbody>${mediasHTML}</tbody>
  </table>

  <h2>Gráficos</h2>

  ${charts.map((svg) => `<div class="chart-box">${svg}</div>`).join("\n  ")}

  <div class="chart-box">${barraChart}</div>

  <h2 class="page-break">Registro de Alarmes</h2>
  ${alarmes.length === 0
    ? '<p style="color:#6b7280;font-style:italic">Nenhum alarme registrado no período.</p>'
    : `<table><thead><tr><th>Data/Hora</th><th>Grandeza</th><th>Severidade</th><th>Valor</th></tr></thead>
    <tbody>${alarmesHTML}</tbody></table>`}

  <h2>Diagnóstico</h2>
  ${linhasDiagnostico
    ? `<table><thead><tr><th>Grandeza</th><th>Valor Médio</th><th>Severidade</th><th>Limite Ultrapassado</th></tr></thead><tbody>${linhasDiagnostico}</tbody></table>`
    : '<p style="color:#6b7280;font-style:italic">Todos os parâmetros dentro da normalidade. Nenhuma ação necessária.</p>'}

  <h2>Recomendações Técnicas (Motor Fuzzy)</h2>
  ${diagnostico && Array.isArray(diagnostico.diagnosticos) && diagnostico.diagnosticos.length > 0
    ? diagnostico.diagnosticos
        .map((d) => {
          const sevClass = d.severidade === "critico" ? "critico" : d.severidade === "aviso" ? "aviso" : "";
          const sevLabel = d.severidade === "critico" ? "CRÍTICO" : d.severidade === "aviso" ? "ATENÇÃO" : "INFO";
          return `<div class="reco ${sevClass}">
        <h4>${d.titulo}<span class="tag">${sevLabel}</span></h4>
        <p><strong>Diagnóstico:</strong> ${d.mensagem}</p>
        <p><strong>Recomendação:</strong> ${d.recomendacao}</p>
      </div>`;
        })
        .join("\n      ")
    : '<p style="color:#6b7280;font-style:italic">Nenhuma anomalia detectada pelo motor fuzzy. Operação dentro dos parâmetros normais.</p>'}

  ${diagnostico?.risco_operacional
    ? `<p style="margin-top:10px;font-size:9px;color:#374151"><strong>Risco Operacional:</strong> ${diagnostico.risco_operacional.score.toFixed(1)} (${diagnostico.risco_operacional.nivel}) &nbsp;|&nbsp; <strong>Urgência:</strong> ${diagnostico.urgencia_intervencao?.nivel ?? "-"} &nbsp;|&nbsp; <strong>Vida Consumida:</strong> ${diagnostico.vida_residual?.consumido ?? 0}%</p>`
    : ""}

  <div class="footer">
    <p>Transformer Health Monitor — Projeto Integrador Microcontroladores 2026</p>
    <p>Este relatório é gerado automaticamente com base nos dados coletados durante o período informado.</p>
  </div>
</body></html>`;
}

router.post("/", async (req, res) => {
  try {
    const { inicio, fim } = req.body;
    if (!inicio || !fim) {
      return res.status(400).json({ error: "Parâmetros 'inicio' e 'fim' são obrigatórios" });
    }

    let diagnostico: DiagnosticoFuzzy | null = null;
    try {
      diagnostico = (await executarDiagnostico()) as DiagnosticoFuzzy;
    } catch (err) {
      console.warn("Diagnóstico fuzzy indisponível, gerando relatório sem recomendações:", err);
    }

    const html = gerarHTML(inicio, fim, diagnostico);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html);
    const pdf = await page.pdf({ format: "A4", margin: { top: "20mm", bottom: "20mm" } });
    await browser.close();

    res.set({ "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=relatorio-transformador.pdf" });
    res.send(pdf);
  } catch (err) {
    console.error("Erro ao gerar PDF:", err);
    res.status(500).json({ error: "Erro ao gerar relatório" });
  }
});

export default router;
