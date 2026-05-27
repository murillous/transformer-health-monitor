import { useEffect, useRef, useState, useCallback } from "react";

type MessageHandler = (data: Record<string, unknown>) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [conectado, setConectado] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const conectar = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.hostname}:3001/ws`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConectado(true);
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch {
        // ignora mensagens mal formatadas
      }
    };
    ws.onerror = () => {
      setConectado(false);
    };
    ws.onclose = () => {
      setConectado(false);
      setTimeout(conectar, 3000);
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    conectar();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [conectar]);

  return conectado;
}
