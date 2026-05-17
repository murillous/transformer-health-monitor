import { Card, CardContent } from "@/components/ui/card";
import LedIndicator from "./LedIndicator";
import type { DiagnosticoResultado } from "@/hooks/useDashboard";
import { ChevronsRight } from "lucide-react";

type Props = {
  diagnostico: DiagnosticoResultado | null;
  onNavigate?: () => void;
};

const borda: Record<string, string> = {
  critico: "border-l-red-500",
  alto: "border-l-orange-500",
  moderado: "border-l-yellow-400",
  baixo: "border-l-green-500",
};

const corTexto: Record<string, string> = {
  critico: "text-red-600",
  alto: "text-orange-600",
  moderado: "text-yellow-600",
  baixo: "text-green-600",
};

export default function DiagnosticoResumo({ diagnostico, onNavigate }: Props) {
  if (!diagnostico) return null;

  const { risco_operacional, diagnosticos, severidade_geral } = diagnostico;

  const ledSev = severidade_geral === "critico" ? "critico" : severidade_geral === "aviso" ? "aviso" : "ok";
  const nivel = risco_operacional.nivel;

  return (
    <Card
      className={`ring-0 shadow-sm border-0 border-l-4 ${borda[nivel] ?? "border-l-green-500"} cursor-pointer hover:bg-accent/50 transition-colors`}
      onClick={onNavigate}
    >
      <CardContent className="p-4 flex flex-col h-full">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Diagnóstico</span>
          <LedIndicator severity={ledSev} />
        </div>
        <div className="mt-2">
          <span className={`text-2xl font-bold ${corTexto[nivel] ?? ""}`}>
            {risco_operacional.score}
          </span>
          <span className={`ml-1.5 text-sm font-medium ${corTexto[nivel] ?? ""}`}>
            {nivel.toUpperCase()}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {diagnosticos.length > 0
              ? `${diagnosticos.length} ${diagnosticos.length === 1 ? "intervenção" : "intervenções"}`
              : "sem intervenções"}
          </span>
          <ChevronsRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
