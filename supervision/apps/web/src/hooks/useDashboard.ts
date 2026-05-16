import { useState, useCallback, useRef } from "react";
import type { LeituraMQTT } from "@transformer-monitor/shared";
import { avaliarSeveridade, mapearGrandeza, LIMITES } from "@transformer-monitor/shared";
import { toast } from "sonner";

const MAX_PONTOS = 150;

const LABELS: Record<string, string> = {
  temperatura: "Temperatura do Núcleo",
  deltaT: "ΔT (Gradiente Térmico)",
  vibracao120hz: "Vibração 120Hz",
  correntePrimario: "Corrente Primário",
  correnteSecundario: "Corrente Secundário",
  vibracao240hz: "Vibração 240Hz",
};

interface PontoGrafico {
  timestamp: number;
  valor: number;
}

export interface AlertaHistorico {
  id: string;
  timestamp: number;
  grandeza: string;
  topico: string;
  valor: number;
  limite: number;
  unidade: string;
  sev: "aviso" | "critico";
  status: "ativo" | "resolvido";
  resolvedAt?: number;
}

export function useDashboard() {
  const [leituras, setLeituras] = useState<Record<string, PontoGrafico[]>>({});
  const [ultimosValores, setUltimosValores] = useState<Record<string, LeituraMQTT>>({});
  const [acquiring, setAcquiring] = useState(true);
  const [historicoAlertas, setHistoricoAlertas] = useState<AlertaHistorico[]>([]);
  const [espectro, setEspectro] = useState<{ freq: number; amplitude: number }[]>([]);
  const espectroRef = useRef<{ freq: number; amplitude: number }[]>([]);

  const ALPHA_EMA = 0.35;

  const processarLeitura = useCallback((data: Record<string, unknown>) => {
    if (!acquiring) return;

    if ("espectro" in data) {
      const raw = data.espectro as { freq: number; amplitude: number }[];
      const prev = espectroRef.current;

      if (prev.length === 0) {
        espectroRef.current = raw;
        setEspectro(raw);
      } else {
        const smoothed = raw.map((bin, i) => ({
          freq: bin.freq,
          amplitude: prev[i]
            ? Math.round((ALPHA_EMA * bin.amplitude + (1 - ALPHA_EMA) * prev[i].amplitude) * 1000) / 1000
            : bin.amplitude,
        }));
        espectroRef.current = smoothed;
        setEspectro(smoothed);
      }
      return;
    }

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
      const limites = LIMITES[grandeza];

      const label = LABELS[grandeza] ?? topico;

      if (sev === "critico") {
        toast.error(`⚠️ ${label}: ${valor}${unidade}`);
      } else if (sev === "aviso") {
        toast.warning(`⚡ ${label}: ${valor}${unidade}`);
      }

      setHistoricoAlertas((prev) => {
        const ativos = prev.filter((a) => a.grandeza === grandeza && a.status === "ativo");

        if (sev === "ok") {
          if (ativos.length === 0) return prev;
          const agora = Date.now();
          return prev.map((a) =>
            a.grandeza === grandeza && a.status === "ativo"
              ? { ...a, status: "resolvido" as const, resolvedAt: agora }
              : a
          );
        }

        if (ativos.some((a) => a.sev === sev)) return prev;

        const limiar = sev === "critico" ? limites.critico : limites.aviso;
        return [
          {
            id: crypto.randomUUID(),
            timestamp: ts,
            grandeza,
            topico,
            valor,
            limite: limiar,
            unidade,
            sev,
            status: "ativo",
          },
          ...prev,
        ];
      });
    }
  }, [acquiring]);

  const resetAlarmes = useCallback(() => {
    setUltimosValores({});
  }, []);

  const limparHistoricoAlertas = useCallback(() => {
    setHistoricoAlertas([]);
  }, []);

  return { leituras, ultimosValores, acquiring, setAcquiring, processarLeitura, resetAlarmes, historicoAlertas, limparHistoricoAlertas, espectro };
}
