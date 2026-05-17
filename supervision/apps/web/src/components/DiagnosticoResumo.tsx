import type { DiagnosticoResultado } from "@/hooks/useDashboard";
import { Brain, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

type Props = {
  diagnostico: DiagnosticoResultado | null;
};

export default function DiagnosticoResumo({ diagnostico }: Props) {
  if (!diagnostico) return null;

  const { risco_operacional, diagnosticos, severidade_geral } = diagnostico;

  const ledCor =
    severidade_geral === "critico" ? "bg-red-500 shadow-red-500/50" :
    severidade_geral === "aviso" ? "bg-yellow-500 shadow-yellow-500/50" :
    "bg-green-500 shadow-green-500/50";

  const riscoCor =
    risco_operacional.nivel === "critico" ? "text-red-500" :
    risco_operacional.nivel === "alto" ? "text-orange-500" :
    risco_operacional.nivel === "moderado" ? "text-yellow-500" :
    "text-green-500";

  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        const tab = document.querySelector('[data-value="diagnostico"]');
        if (tab instanceof HTMLElement) tab.click();
      }}
      className="group flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
    >
      <div className="relative">
        <Brain className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
        <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full animate-pulse ${ledCor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Diagnóstico Inteligente</span>
          {diagnosticos.length > 0 && (
            <span className={`text-xs font-semibold ${riscoCor}`}>
              {risco_operacional.nivel.toUpperCase()} ({risco_operacional.score})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {severidade_geral === "ok" ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span>Todos os parâmetros normais</span>
            </>
          ) : (
            <>
              <AlertCircle className={`h-3 w-3 ${riscoCor}`} />
              <span>
                {diagnosticos.length} {diagnosticos.length === 1 ? "intervenção necessária" : "intervenções necessárias"}
              </span>
            </>
          )}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
    </a>
  );
}
