import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Brain, Lightbulb, Wrench } from "lucide-react";
import type { DiagnosticoResultado } from "@/hooks/useDashboard";

type Props = {
  diagnostico: DiagnosticoResultado | null;
};

function RiskBar({ score, nivel }: { score: number; nivel: string }) {
  const cor =
    nivel === "critico" ? "bg-red-500" :
    nivel === "alto" ? "bg-orange-500" :
    nivel === "moderado" ? "bg-yellow-500" :
    "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${cor}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-xs font-medium w-20 text-right">{nivel.toUpperCase()} ({score})</span>
    </div>
  );
}

function SeverityLED({ sev }: { sev: string }) {
  const cor =
    sev === "critico" ? "bg-red-500 shadow-red-500/50" :
    sev === "alto" || sev === "aviso" ? "bg-yellow-500 shadow-yellow-500/50" :
    "bg-green-500 shadow-green-500/50";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full animate-pulse ${cor}`} />;
}

export default function DiagnosticoPanel({ diagnostico }: Props) {
  if (!diagnostico) return null;

  const { risco_operacional, urgencia_intervencao, diagnosticos, severidade_geral } = diagnostico;
  const sevGeralLED =
    severidade_geral === "critico" ? "bg-red-500 shadow-red-500/50" :
    severidade_geral === "aviso" ? "bg-yellow-500 shadow-yellow-500/50" :
    "bg-green-500 shadow-green-500/50";

  return (
    <Card className="ring-0 shadow-sm border-0">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Diagnóstico Inteligente
          <span className={`inline-block h-2.5 w-2.5 rounded-full animate-pulse ${sevGeralLED}`} />
          {diagnosticos.length > 0 && (
            <Badge variant={severidade_geral === "critico" ? "destructive" : "secondary"}>
              {diagnosticos.length} {diagnosticos.length === 1 ? "intervenção" : "intervenções"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Risco Operacional</span>
            <RiskBar score={risco_operacional.score} nivel={risco_operacional.nivel} />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Urgência de Intervenção</span>
            <RiskBar score={urgencia_intervencao.score} nivel={urgencia_intervencao.nivel} />
          </div>
        </div>

        {diagnosticos.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Lightbulb className="h-3 w-3" /> Sugestões de Intervenção
            </span>
            {diagnosticos.map((d, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                {d.severidade === "critico" ? (
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <SeverityLED sev={d.severidade} />
                    <Badge
                      variant={d.severidade === "critico" ? "destructive" : "secondary"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {d.severidade === "critico" ? "CRÍTICO" : "AVISO"}
                    </Badge>
                    <span className="text-xs font-medium truncate">{d.titulo}</span>
                  </div>
                  <p className="text-xs text-foreground/90">{d.mensagem}</p>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                    <Wrench className="h-3 w-3" />
                    <span>{d.recomendacao}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {diagnosticos.length === 0 && severidade_geral === "ok" && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <AlertCircle className="h-4 w-4" />
            Todos os parâmetros dentro da normalidade. Nenhuma intervenção necessária.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
