import express from "express";
import http from "http";
import path from "path";
import historicoRouter from "./api/historico";
import relatorioRouter from "./api/relatorio";
import { WebSocketHub } from "./ws/hub";
import { MQTTSubscriber } from "./mqtt/subscriber";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

app.use(express.json());

// API routes
app.use("/api/historico", historicoRouter);
app.use("/api/relatorio", relatorioRouter);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Serve frontend build in production
const distPath = path.resolve(__dirname, "../web/dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// WebSocket hub
const wsHub = new WebSocketHub(server);

// MQTT subscriber → broadcast via WS
const mqttSub = new MQTTSubscriber();
mqttSub.on("leitura", (data) => {
  wsHub.broadcast(data);
});
mqttSub.connect(process.env.MQTT_BROKER || "mqtt://localhost:1883");

server.listen(PORT, () => {
  console.log(`Server rodando em :${PORT}`);
});
