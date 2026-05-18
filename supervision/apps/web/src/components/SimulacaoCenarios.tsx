import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Activity, Flame, Zap, Wrench, Power, RotateCcw } from "lucide-react";

interface Cenario {
  tipo: string;
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
  cor: string;
}

const CENARIOS: Cenario[] = [
  {
    tipo: "sobreaquecimento",
    titulo: "Sobreaquecimento",
    descricao: "Temperatura sobe pra 92°C (acima do crítico 85°C) com ΔT 28°C.",
    icone: <Flame className="h-4 w-4" />,
    cor: "border-red-500 hover:bg-red-50 dark:hover:bg-red-950/30",
  },
  {
    tipo: "sobrecarga",
    titulo: "Sobrecarga Elétrica",
    descricao: "Corrente primário 6.8 A + secundário 50 A. Temperatura sobe.",
    icone: <Zap className="h-4 w-4" />,
    cor: "border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30",
  },
  {
    tipo: "vibracao_critica",
    titulo: "Vibração Crítica",
    descricao: "120Hz=0.52g, 240Hz=0.28g. Falha mecânica do núcleo.",
    icone: <Activity className="h-4 w-4" />,
    cor: "border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/30",
  },
  {
    tipo: "inrush_severo",
    titulo: "Inrush Severo",
    descricao: "4 picos consecutivos (2.5, 3.2, 3.8, 4.2 A). Falta intermitente.",
    icone: <Power className="h-4 w-4" />,
    cor: "border-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-950/30",
  },
  {
    tipo: "falha_eletromecanica",
    titulo: "Falha Eletromecânica",
    descricao: "Combo: corrente alta + vibração elevada + temperatura subindo.",
    icone: <Wrench className="h-4 w-4" />,
    cor: "border-red-700 hover:bg-red-100 dark:hover:bg-red-950/40",
  },
];

interface CenarioAtual {
  tipo: string | null;
  ate_ms: number;
  restante_s: number;
}

export default function SimulacaoCenarios() {
  const [duracao, setDuracao] = useState(30);
  const [atual, setAtual] = useState<CenarioAtual>({ tipo: null, ate_ms: 0, restante_s: 0 });
  const [enviando, setEnviando] = useState<string | null>(null);

  const carregarAtual = useCallback(async () => {
    try {
      const r = await fetch("/api/simular/cenario/atual");
      if (r.ok) setAtual(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    carregarAtual();
    const id = setInterval(carregarAtual, 2000);
    return () => clearInterval(id);
  }, [carregarAtual]);

  const dispararCenario = useCallback(async (tipo: string) => {
    setEnviando(tipo);
    try {
      await fetch("/api/simular/cenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, duracao_s: duracao }),
      });
      await carregarAtual();
    } finally {
      setEnviando(null);
    }
  }, [duracao, carregarAtual]);

  const limpar = useCallback(async () => {
    await dispararCenario("limpar");
  }, [dispararCenario]);

  return (
    <div className="space-y-4">
      <Card className="ring-0 shadow-sm border-0">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            Simulação de Falhas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Aplique cenários de falha sintéticos pra demonstrar a reação do diagnóstico fuzzy.
            Os valores sobrepõem o simulador base por N segundos, depois voltam ao normal.
            Requer simulador ativo (botão Iniciar no painel).
          </p>

          <div className="flex items-center gap-3">
            <label className="text-xs font-medium">Duração (s):</label>
            <input
              type="number"
              min={10}
              max={300}
              step={10}
              value={duracao}
              onChange={(e) => setDuracao(Math.max(10, Math.min(300, parseInt(e.target.value) || 30)))}
              className="border rounded px-2 py-1 text-xs w-24"
            />
            {atual.tipo && (
              <div className="ml-auto flex items-center gap-2 text-xs">
                <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                <span className="font-medium">Ativo: {atual.tipo}</span>
                <span className="text-muted-foreground">— termina em {atual.restante_s}s</span>
                <Button size="sm" variant="ghost" onClick={limpar}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Parar
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CENARIOS.map((c) => {
              const ativo = atual.tipo === c.tipo;
              return (
                <button
                  key={c.tipo}
                  onClick={() => dispararCenario(c.tipo)}
                  disabled={enviando === c.tipo}
                  className={`text-left p-3 rounded-md border-l-4 border bg-card transition-colors ${c.cor} ${ativo ? "ring-2 ring-offset-1 ring-yellow-500" : ""} ${enviando === c.tipo ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-2 font-medium text-sm mb-1">
                    {c.icone}
                    {c.titulo}
                    {ativo && <span className="ml-auto text-[10px] text-yellow-600 font-semibold">ATIVO</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{c.descricao}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
