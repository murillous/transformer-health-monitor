import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

export class WebSocketHub {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      console.log(`WS cliente conectado (${this.clients.size} total)`);

      ws.on("close", () => {
        this.clients.delete(ws);
        console.log(`WS cliente desconectado (${this.clients.size} total)`);
      });

      ws.on("error", (err) => {
        console.error("WS error:", err);
        this.clients.delete(ws);
      });
    });
  }

  broadcast(data: object): void {
    const msg = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }
}
