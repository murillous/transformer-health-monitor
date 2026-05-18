import mqtt from "mqtt";
import { EventEmitter } from "events";
import {
  leituraSchema,
  TOPICOS_INSCREVER,
  TOPICOS_MQTT,
} from "@transformer-monitor/shared";
import { store } from "../db/store";

export class MQTTSubscriber extends EventEmitter {
  private client: mqtt.MqttClient | null = null;

  connect(brokerUrl = "mqtt://localhost:1883"): void {
    this.client = mqtt.connect(brokerUrl, {
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    this.client.on("connect", () => {
      console.log(`MQTT conectado em ${brokerUrl}`);
      this.client!.subscribe(TOPICOS_INSCREVER, (err) => {
        if (err) console.error("Erro ao subscrever:", err);
        else console.log(`Inscrito em ${TOPICOS_INSCREVER.length} tópicos`);
      });
    });

    this.client.on("reconnect", () => {
      console.log("MQTT reconectando...");
    });

    this.client.on("close", () => {
      console.warn("Conexão MQTT fechada");
    });

    this.client.on("offline", () => {
      console.warn("MQTT offline");
    });

    this.client.on("message", (topico, payload) => {
      try {
        const parsed = JSON.parse(payload.toString());

        if (topico === TOPICOS_MQTT.alarme) {
          const sevFw = parsed.severidade === "critico" ? "critico" : "aviso";
          store.pushAlarme({
            ts: Number(parsed.ts ?? Math.floor(Date.now() / 1000)),
            tipo: String(parsed.tipo ?? "desconhecido"),
            sev: sevFw,
            valor: Number(parsed.valor ?? 0),
            limite: Number(parsed.limite ?? 0),
          });
          this.emit("leitura", { topico, ...parsed });
          return;
        }

        if (topico === TOPICOS_MQTT.vibracaoEspectro && Array.isArray(parsed.espectro)) {
          this.emit("leitura", {
            topico,
            ts: Number(parsed.ts ?? Math.floor(Date.now() / 1000)),
            espectro: parsed.espectro,
          });
          return;
        }

        if ((topico === TOPICOS_MQTT.ondaPrimario || topico === TOPICOS_MQTT.ondaSecundario)
            && Array.isArray(parsed.amostras)) {
          this.emit("leitura", {
            topico,
            ts: Number(parsed.ts ?? Math.floor(Date.now() / 1000)),
            amostras: parsed.amostras,
          });
          return;
        }

        // Defesa extra: firmware pode emitir NaN/null no boot antes do cache
        // do sensor ter leitura valida. Skipa silenciosamente pra evitar ruido.
        if (parsed == null || !Number.isFinite(parsed.valor)) {
          return;
        }

        const data = leituraSchema.parse(parsed);

        store.push({
          timestamp: new Date().toISOString(),
          topico,
          valor: data.valor,
          unidade: data.unidade,
          alarme: "",
        });

        this.emit("leitura", { topico, ...data });
      } catch (err) {
        console.error(`Payload inválido no tópico ${topico}:`, err);
      }
    });

    this.client.on("error", (err) => {
      console.error("MQTT error:", err);
    });
  }

  disconnect(): void {
    this.client?.end();
  }
}
