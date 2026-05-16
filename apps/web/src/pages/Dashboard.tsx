import { useWebSocket } from "@/hooks/useWebSocket";
import { useDashboard } from "@/hooks/useDashboard";
import MetricCard from "@/components/MetricCard";
import Chart from "@/components/Chart";
import AlertsPanel from "@/components/AlertsPanel";
import { TOPICOS_MQTT } from "@transformer-monitor/shared";

export default function Dashboard() {
  const { leituras, ultimosValores, processarLeitura } = useDashboard();
  useWebSocket(processarLeitura);

  const metricas = [
    { titulo: "Temperatura", topico: TOPICOS_MQTT.temperaturaNucleo },
    { titulo: "ΔT", topico: TOPICOS_MQTT.deltaT },
    { titulo: "Corrente P", topico: TOPICOS_MQTT.correntePrimario },
    { titulo: "Corrente S", topico: TOPICOS_MQTT.correnteSecundario },
  ];

  return (
    <div className="space-y-6">
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

      <AlertsPanel ultimosValores={ultimosValores} />
    </div>
  );
}
