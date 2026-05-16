import { useState, useCallback } from "react";
import type { LeituraMQTT } from "@transformer-monitor/shared";

const MAX_PONTOS = 150;

interface PontoGrafico {
  timestamp: number;
  valor: number;
}

export function useDashboard() {
  const [leituras, setLeituras] = useState<Record<string, PontoGrafico[]>>({});
  const [ultimosValores, setUltimosValores] = useState<Record<string, LeituraMQTT>>({});

  const processarLeitura = useCallback((data: Record<string, unknown>) => {
    const { topico, valor, ts, unidade } = data as { topico: string; valor: number; ts: number; unidade: string };

    setUltimosValores((prev) => ({ ...prev, [topico]: { ts, valor, unidade } }));

    setLeituras((prev) => {
      const serie = [...(prev[topico] || []), { timestamp: ts * 1000, valor }];
      if (serie.length > MAX_PONTOS) serie.shift();
      return { ...prev, [topico]: serie };
    });
  }, []);

  return { leituras, ultimosValores, processarLeitura };
}
