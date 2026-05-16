import { useState, useCallback } from "react";
import type { LeituraMQTT } from "@transformer-monitor/shared";
import { avaliarSeveridade, mapearGrandeza } from "@transformer-monitor/shared";
import { toast } from "sonner";

const MAX_PONTOS = 150;

interface PontoGrafico {
  timestamp: number;
  valor: number;
}

export function useDashboard() {
  const [leituras, setLeituras] = useState<Record<string, PontoGrafico[]>>({});
  const [ultimosValores, setUltimosValores] = useState<Record<string, LeituraMQTT>>({});
  const [acquiring, setAcquiring] = useState(true);

  const processarLeitura = useCallback((data: Record<string, unknown>) => {
    if (!acquiring) return;

    const { topico, valor, ts, unidade } = data as { topico: string; valor: number; ts: number; unidade: string };

    setUltimosValores((prev) => ({ ...prev, [topico]: { ts, valor, unidade } }));

    setLeituras((prev) => {
      const serie = [...(prev[topico] || []), { timestamp: ts * 1000, valor }];
      if (serie.length > MAX_PONTOS) serie.shift();
      return { ...prev, [topico]: serie };
    });

    const grandeza = mapearGrandeza(topico);
    if (grandeza) {
      const sev = avaliarSeveridade(grandeza, valor);
      if (sev === "critico") {
        toast.error(`⚠️ ${topico}: ${valor}${unidade}`);
      } else if (sev === "aviso") {
        toast.warning(`⚡ ${topico}: ${valor}${unidade}`);
      }
    }
  }, [acquiring]);

  const resetAlarmes = useCallback(() => {
    setUltimosValores({});
  }, []);

  return { leituras, ultimosValores, acquiring, setAcquiring, processarLeitura, resetAlarmes };
}
