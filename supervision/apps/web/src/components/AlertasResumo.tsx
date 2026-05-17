import { Card, CardContent } from "@/components/ui/card";
import LedIndicator from "./LedIndicator";
import type { LeituraMQTT } from "@transformer-monitor/shared";
import { avaliarSeveridade, mapearGrandeza } from "@transformer-monitor/shared";
import { ChevronsRight } from "lucide-react";

type Props = {
  ultimosValores: Record<string, LeituraMQTT>;
  onNavigate?: () => void;
};

const borda: Record<string, string> = {
  critico: "border-l-red-500",
  aviso: "border-l-yellow-400",
  ok: "border-l-green-500",
};

const corTexto: Record<string, string> = {
  critico: "text-red-600",
  aviso: "text-yellow-600",
  ok: "text-green-600",
};

export default function AlertasResumo({ ultimosValores, onNavigate }: Props) {
  let maxSev: "ok" | "aviso" | "critico" = "ok";
  let ativos = 0;

  for (const [topico, leitura] of Object.entries(ultimosValores)) {
    const grandeza = mapearGrandeza(topico);
    if (!grandeza) continue;
    const sev = avaliarSeveridade(grandeza, leitura.valor);
    if (sev !== "ok") ativos++;
    if (sev === "critico") maxSev = "critico";
    else if (sev === "aviso" && maxSev !== "critico") maxSev = "aviso";
  }

  return (
    <Card
      className={`ring-0 shadow-sm border-0 border-l-4 ${borda[maxSev]} cursor-pointer hover:bg-accent/50 transition-colors`}
      onClick={onNavigate}
    >
      <CardContent className="p-4 flex flex-col h-full">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Alertas</span>
          <div className="flex items-center gap-1.5">
            <LedIndicator severity={maxSev} />
          </div>
        </div>
        <div className="mt-2">
          <span className={`text-2xl font-bold ${corTexto[maxSev]}`}>
            {ativos}
          </span>
          <span className={`ml-1.5 text-sm font-medium ${corTexto[maxSev]}`}>
            {ativos > 0
              ? maxSev === "critico" ? "CRÍTICO" : "AVISO"
              : "NORMAL"}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {ativos > 0
              ? `${ativos === 1 ? "ativo" : "ativos"}`
              : "sem alertas"}
          </span>
          <ChevronsRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
