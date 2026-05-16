import { useWebSocket } from "@/hooks/useWebSocket";
import { useDashboard } from "@/hooks/useDashboard";
import MetricCard from "@/components/MetricCard";
import Chart from "@/components/Chart";
import AlertsPanel from "@/components/AlertsPanel";
import { Button } from "@/components/ui/button";
import { Play, Square, RotateCcw } from "lucide-react";
import { TOPICOS_MQTT } from "@transformer-monitor/shared";

export default function Dashboard() {
  const { leituras, ultimosValores, acquiring, setAcquiring, processarLeitura, resetAlarmes } = useDashboard();
  useWebSocket(processarLeitura);

  const V1 = 220;
  const V2 = 12;

  const correntePPontos = leituras[TOPICOS_MQTT.correntePrimario] ?? [];
  const correnteSPontos = leituras[TOPICOS_MQTT.correnteSecundario] ?? [];

  const eficienciaPontos = correntePPontos
    .map((pPrimario) => {
      const pSecundario = correnteSPontos.find(
        (s) => Math.abs(s.timestamp - pPrimario.timestamp) < 100
      );
      if (!pSecundario || pPrimario.valor === 0) return null;
      const eficiencia = ((V2 * pSecundario.valor) / (V1 * pPrimario.valor)) * 100;
      return { timestamp: pPrimario.timestamp, valor: Math.min(eficiencia, 100) };
    })
    .filter(Boolean) as { timestamp: number; valor: number }[];

  const metricas = [
    { titulo: "Temperatura", topico: TOPICOS_MQTT.temperaturaNucleo },
    { titulo: "ΔT", topico: TOPICOS_MQTT.deltaT },
    { titulo: "Corrente P", topico: TOPICOS_MQTT.correntePrimario },
    { titulo: "Corrente S", topico: TOPICOS_MQTT.correnteSecundario },
  ];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant={acquiring ? "destructive" : "default"}
          onClick={() => setAcquiring(!acquiring)}
          className="gap-2"
        >
          {acquiring ? (
            <><Square className="h-4 w-4" /> Parar</>
          ) : (
            <><Play className="h-4 w-4" /> Iniciar</>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={resetAlarmes}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" /> Reset Alarmes
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {metricas.map((m) => (
          <MetricCard
            key={m.topico}
            titulo={m.titulo}
            topico={m.topico}
            leitura={ultimosValores[m.topico] ?? null}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Chart
          titulo="Temperatura (°C)"
          series={[
            {
              dataKey: "temp",
              nome: "Núcleo",
              cor: "#ef4444",
              pontos: leituras[TOPICOS_MQTT.temperaturaNucleo] ?? [],
            },
          ]}
        />
        <Chart
          titulo="Correntes (A)"
          series={[
            {
              dataKey: "primario",
              nome: "Primário",
              cor: "#3b82f6",
              pontos: leituras[TOPICOS_MQTT.correntePrimario] ?? [],
            },
            {
              dataKey: "secundario",
              nome: "Secundário",
              cor: "#10b981",
              pontos: leituras[TOPICOS_MQTT.correnteSecundario] ?? [],
            },
          ]}
        />
        <Chart
          titulo="Vibração (g)"
          series={[
            {
              dataKey: "v120",
              nome: "120Hz",
              cor: "#f59e0b",
              pontos: leituras[TOPICOS_MQTT.vibracao120hz] ?? [],
            },
            {
              dataKey: "v240",
              nome: "240Hz",
              cor: "#8b5cf6",
              pontos: leituras[TOPICOS_MQTT.vibracao240hz] ?? [],
            },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Chart
          titulo="Rendimento (%)"
          series={[
            {
              dataKey: "rendimento",
              nome: "η",
              cor: "#06b6d4",
              pontos: eficienciaPontos,
            },
          ]}
        />
      </div>

      <AlertsPanel ultimosValores={ultimosValores} />
    </div>
  );
}
