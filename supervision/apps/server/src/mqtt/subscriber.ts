import mqtt from "mqtt";
import { EventEmitter } from "events";
import {
  leituraSchema,
  TOPICOS_INSCREVER,
} from "@transformer-monitor/shared";
import { store } from "../db/store";

export class MQTTSubscriber extends EventEmitter {
  private client: mqtt.MqttClient | null = null;

  connect(brokerUrl = "mqtt://localhost:1883"): void {
    this.client = mqtt.connect(brokerUrl, { reconnectPeriod: 0 });

    this.client.on("connect", () => {
      console.log(`MQTT conectado em ${brokerUrl}`);
      this.client!.subscribe(TOPICOS_INSCREVER, (err) => {
        if (err) console.error("Erro ao subscrever:", err);
        else console.log(`Inscrito em ${TOPICOS_INSCREVER.length} tópicos`);
      });
    });

    this.client.on("message", (topico, payload) => {
      try {
        const parsed = JSON.parse(payload.toString());
        const data = leituraSchema.parse(parsed);

        store.push({
          timestamp: new Date().toISOString(),
          topico,
          valor: data.valor,
          unidade: data.unidade,
          alarme: "",
        });

        if (topico === "transformador/status/alarme") {
          store.pushAlarme({ ...data, tipo: topico, sev: "aviso", limite: 0 });
        }

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
