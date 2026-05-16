import { useEffect, useRef } from "react";

type MessageHandler = (data: Record<string, unknown>) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.hostname}:3001/ws`;
    const ws = new WebSocket(url);

    ws.onopen = () => console.log("WS conectado");
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        // ignora mensagens mal formatadas
      }
    };
    ws.onerror = () => console.error("WS erro");
    ws.onclose = () => console.log("WS desconectado");

    wsRef.current = ws;
    return () => ws.close();
  }, [onMessage]);

  return wsRef;
}
