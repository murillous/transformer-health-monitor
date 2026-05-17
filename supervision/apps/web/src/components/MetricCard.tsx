import { Card, CardContent } from "@/components/ui/card";
import LedIndicator from "./LedIndicator";
import { avaliarSeveridade, mapearGrandeza } from "@transformer-monitor/shared";
import type { LeituraMQTT } from "@transformer-monitor/shared";

type Props = {
  titulo: string;
  topico: string;
  leitura: LeituraMQTT | null;
};

const borda: Record<string, string> = {
  critico: "border-l-red-500",
  aviso: "border-l-yellow-400",
  ok: "border-l-green-500",
};

const corTexto: Record<string, string> = {
  critico: "text-red-600",
  aviso: "text-yellow-600",
  ok: "",
};

export default function MetricCard({ titulo, topico, leitura }: Props) {
  const grandeza = mapearGrandeza(topico);
  const sev = grandeza && leitura ? avaliarSeveridade(grandeza, leitura.valor) : "ok";

  return (
    <Card className={`ring-0 shadow-sm border-0 border-l-4 ${borda[sev]}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{titulo}</span>
          <LedIndicator severity={sev} />
        </div>
        <div className="mt-2">
          <span className={`text-2xl font-bold ${corTexto[sev]}`}>
            {leitura ? leitura.valor.toFixed(1) : "---"}
          </span>
          <span className="ml-1 text-sm text-muted-foreground">
            {leitura?.unidade ?? ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
