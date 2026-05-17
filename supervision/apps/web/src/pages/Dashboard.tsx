import { useCallback, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useDashboard } from "@/hooks/useDashboard";
import MetricCard from "@/components/MetricCard";
import Chart from "@/components/Chart";
import SpectrumChart from "@/components/SpectrumChart";
import WaveformChart from "@/components/WaveformChart";
import AlertasResumo from "@/components/AlertasResumo";
import DiagnosticoPanel from "@/components/DiagnosticoPanel";
import DiagnosticoResumo from "@/components/DiagnosticoResumo";
import Relatorio from "./Relatorio";
import Alertas from "./Alertas";
import { Button } from "@/components/ui/button";
import { Activity, Play, Square, RotateCcw } from "lucide-react";
import { TOPICOS_MQTT } from "@transformer-monitor/shared";

export default function Dashboard() {
  const [tabAtual, setTabAtual] = useState("painel");
  const { leituras, ultimosValores, acquiring, setAcquiring, processarLeitura, resetAlarmes, historicoAlertas, espectro, diagnostico, historicoRisco, ondaPrimario, ondaSecundario } = useDashboard();
  useWebSocket(processarLeitura);

  const toggleAquisicao = useCallback(async () => {
    if (acquiring) {
      await fetch("/api/simular/parar", { method: "POST" });
    } else {
      await fetch("/api/simular/iniciar", { method: "POST" });
    }
    setAcquiring(!acquiring);
  }, [acquiring]);

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

  const alertasAtivos = historicoAlertas.filter((a) => a.status === "ativo").length;

  const metricas = [
    { titulo: "Temperatura", topico: TOPICOS_MQTT.temperaturaNucleo },
    { titulo: "ΔT", topico: TOPICOS_MQTT.deltaT },
    { titulo: "Corrente P", topico: TOPICOS_MQTT.correntePrimario },
    { titulo: "Corrente S", topico: TOPICOS_MQTT.correnteSecundario },
  ];

  return (
    <Tabs value={tabAtual} onValueChange={setTabAtual} className="min-h-screen bg-background flex-col">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-center px-6 py-3">
          <div className="absolute left-6 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-semibold">Transformer Health Monitor</span>
          </div>
          <TabsList variant="line" className="bg-transparent justify-center rounded-none h-auto gap-6">
            <TabsTrigger value="painel" className="flex-none">Painel de Controle</TabsTrigger>
            <TabsTrigger value="alertas" className="flex-none">
              <span className="relative">
                Alertas
                {alertasAtivos > 0 && (
                  <span className="absolute -top-1.5 -right-3 h-2 w-2 rounded-full bg-red-500" />
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="diagnostico" className="flex-none">Diagnóstico</TabsTrigger>
            <TabsTrigger value="relatorio" className="flex-none">Relatório</TabsTrigger>
          </TabsList>
        </div>
      </header>

      <main className="p-6">
        <TabsContent value="painel" className="space-y-6">
          <div className="flex items-center gap-2">
            <Button
              variant={acquiring ? "destructive" : "default"}
              onClick={toggleAquisicao}
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

          <div className="grid grid-cols-6 gap-4">
            {metricas.map((m) => (
              <MetricCard
                key={m.topico}
                titulo={m.titulo}
                topico={m.topico}
                leitura={ultimosValores[m.topico] ?? null}
              />
            ))}
            <DiagnosticoResumo diagnostico={diagnostico} onNavigate={() => setTabAtual("diagnostico")} />
            <AlertasResumo ultimosValores={ultimosValores} onNavigate={() => setTabAtual("alertas")} />
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
            <SpectrumChart dados={espectro} />
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

          <div className="grid grid-cols-2 gap-4">
            <WaveformChart titulo="Forma de Onda — Corrente Primário" amostras={ondaPrimario} cor="#3b82f6" />
            <WaveformChart titulo="Forma de Onda — Corrente Secundário" amostras={ondaSecundario} cor="#10b981" />
          </div>

        </TabsContent>

        <TabsContent value="diagnostico" className="space-y-6">
          <DiagnosticoPanel diagnostico={diagnostico} historicoRisco={historicoRisco} />
        </TabsContent>

        <TabsContent value="alertas">
          <Alertas />
        </TabsContent>

        <TabsContent value="relatorio">
          <Relatorio />
        </TabsContent>
      </main>
    </Tabs>
  );
}
