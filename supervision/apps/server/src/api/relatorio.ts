import { Router } from "express";
import puppeteer from "puppeteer";
import { store } from "../db/store";
import {
  avaliarSeveridade,
  mapearGrandeza,
  LIMITES,
} from "@transformer-monitor/shared";

const router = Router();

function gerarHTML(inicio: string, fim: string): string {
  const inicioDate = new Date(inicio);
  const fimDate = new Date(fim);
  const registros = store.registrosPorPeriodo(inicioDate, fimDate);
  const alarmes = store.getAlarmes();

  const topicosUnicos = [...new Set(registros.map((r) => r.topico))];
  const medias = topicosUnicos.map((topico) => {
    const vals = registros.filter((r) => r.topico === topico).map((r) => r.valor);
    const media = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    return { topico, media: media.toFixed(2), unidade: registros.find((r) => r.topico === topico)?.unidade ?? "" };
  });

  const linhasDiagnostico = medias
    .map((m) => {
      const grandeza = mapearGrandeza(m.topico);
      if (!grandeza) return null;
      const sev = avaliarSeveridade(grandeza, parseFloat(m.media));
      if (sev === "ok") return null;
      const lim = LIMITES[grandeza];
      return `<tr>
        <td>${m.topico}</td>
        <td>${m.media} ${m.unidade}</td>
        <td style="color:${sev === "critico" ? "red" : "orange"}; font-weight:bold">${sev.toUpperCase()}</td>
        <td>${sev === "critico" ? `Acima de ${lim.critico} ${m.unidade}` : `Acima de ${lim.aviso} ${m.unidade}`}</td>
      </tr>`;
    })
    .filter(Boolean)
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
  h1 { color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 8px; }
  h2 { color: #374151; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #d1d5db; padding: 10px 12px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  .info { color: #6b7280; font-size: 14px; }
  .footer { margin-top: 40px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style></head><body>
  <h1>Relatório de Diagnóstico — Transformer Health Monitor</h1>
  <p class="info">Gerado em: ${new Date().toISOString()}</p>
  <p class="info">Período: ${inicio} a ${fim}</p>
  <h2>Médias por Grandeza</h2>
  <table><thead><tr><th>Grandeza</th><th>Média</th></tr></thead>
    <tbody>${medias.map((m) => `<tr><td>${m.topico}</td><td>${m.media} ${m.unidade}</td></tr>`).join("")}</tbody>
  </table>
  <h2>Alertas no Período</h2>
  ${alarmes.length === 0 ? "<p>Nenhum alerta registrado.</p>" : `<table><thead><tr><th>Timestamp</th><th>Tipo</th><th>Severidade</th><th>Valor</th></tr></thead>
    <tbody>${alarmes.map((a) => `<tr><td>${new Date(a.ts * 1000).toISOString()}</td><td>${a.tipo}</td><td style="color:${a.sev === "critico" ? "red" : "orange"}">${a.sev.toUpperCase()}</td><td>${a.valor}</td></tr>`).join("")}</tbody>
  </table>`}
  <h2>Diagnóstico</h2>
  ${linhasDiagnostico ? `<table><thead><tr><th>Grandeza</th><th>Valor</th><th>Severidade</th><th>Recomendação</th></tr></thead><tbody>${linhasDiagnostico}</tbody></table>` : "<p>Todos os parâmetros dentro da normalidade.</p>"}
  <div class="footer">Transformer Health Monitor — Projeto Integrador Microcontroladores 2026</div>
</body></html>`;
}

router.post("/", async (req, res) => {
  try {
    const { inicio, fim } = req.body;
    if (!inicio || !fim) {
      return res.status(400).json({ error: "Parâmetros 'inicio' e 'fim' são obrigatórios" });
    }

    const html = gerarHTML(inicio, fim);
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
