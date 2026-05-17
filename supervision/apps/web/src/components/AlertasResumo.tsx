import { Card, CardContent } from "@/components/ui/card";
import LedIndicator from "./LedIndicator";
import type { LeituraMQTT } from "@transformer-monitor/shared";
import { avaliarSeveridade, mapearGrandeza } from "@transformer-monitor/shared";
import { Bell } from "lucide-react";

type Props = {
  ultimosValores: Record<string, LeituraMQTT>;
};

export default function AlertasResumo({ ultimosValores }: Props) {
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
    <Card className="ring-0 shadow-sm border-0">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Alertas</span>
          </div>
          <LedIndicator severity={maxSev} />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold">
            {ativos > 0 ? `${ativos} ativo${ativos > 1 ? "s" : ""}` : "0"}
          </span>
          <span className="text-sm text-muted-foreground">
            {ativos > 0 ? (maxSev === "critico" ? "Crítico" : "Aviso") : "Normal"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
