import { Card, CardContent } from "@/components/ui/card";
import LedIndicator from "./LedIndicator";
import type { DiagnosticoResultado } from "@/hooks/useDashboard";
import { Brain, ArrowRight } from "lucide-react";

type Props = {
  diagnostico: DiagnosticoResultado | null;
  onNavigate?: () => void;
};

export default function DiagnosticoResumo({ diagnostico, onNavigate }: Props) {
  if (!diagnostico) return null;

  const { risco_operacional, diagnosticos, severidade_geral } = diagnostico;

  const ledSev = severidade_geral === "critico" ? "critico" : severidade_geral === "aviso" ? "aviso" : "ok";

  return (
    <Card
      className="ring-0 shadow-sm border-0 cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Diagnóstico Inteligente</span>
          </div>
          <div className="flex items-center gap-2">
            <LedIndicator severity={ledSev} />
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold">
            {diagnosticos.length > 0
              ? `${risco_operacional.nivel.toUpperCase()} (${risco_operacional.score})`
              : "NORMAL"}
          </span>
          <span className="text-sm text-muted-foreground">
            {diagnosticos.length > 0
              ? `${diagnosticos.length} ${diagnosticos.length === 1 ? "intervenção" : "intervenções"}`
              : "Sem intervenções"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
