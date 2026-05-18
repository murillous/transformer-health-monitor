import express from "express";
import http from "http";
import path from "path";
import historicoRouter from "./api/historico";
import relatorioRouter from "./api/relatorio";
import diagnosticoRouter from "./api/diagnostico";
import { WebSocketHub } from "./ws/hub";
import { MQTTSubscriber } from "./mqtt/subscriber";
import { createSimuladorRouter } from "./api/simular";
import { executarDiagnostico } from "./api/diagnostico";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

app.use(express.json());

// WebSocket hub
const wsHub = new WebSocketHub(server);

// Simulador embutido (usado via API /api/simular/iniciar + /api/simular/parar)
app.use("/api/simular", createSimuladorRouter(wsHub));

// API routes
app.use("/api/historico", historicoRouter);
app.use("/api/relatorio", relatorioRouter);
app.use("/api/diagnostico", diagnosticoRouter);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Serve frontend build in production
const distPath = path.resolve(__dirname, "../web/dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// MQTT subscriber → broadcast via WS (opcional — não trava se broker estiver offline)
const mqttSub = new MQTTSubscriber();
let recebeuMqtt = false;
mqttSub.on("leitura", (data) => {
  wsHub.broadcast(data);
  recebeuMqtt = true;
});
if (process.env.MQTT_BROKER !== "none") {
  mqttSub.connect(process.env.MQTT_BROKER || "mqtt://localhost:1883");
}

// Loop de diagnóstico para dados vindos do MQTT (firmware real). O simulador
// embutido tem seu próprio loop em /api/simular/iniciar e não usa este.
setInterval(() => {
  if (!recebeuMqtt) return;
  executarDiagnostico()
    .then((diag) => {
      wsHub.broadcast({ topico: "diagnostico", ts: Math.floor(Date.now() / 1000), diagnostico: diag });
    })
    .catch((err) => console.error("Erro no diagnóstico MQTT:", err.message));
}, 2000);

server.listen(PORT, () => {
  console.log(`Server rodando em :${PORT}`);
});
