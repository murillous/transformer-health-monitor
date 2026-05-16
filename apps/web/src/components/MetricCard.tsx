import { Card, CardContent } from "@/components/ui/card";
import LedIndicator from "./LedIndicator";
import { avaliarSeveridade, mapearGrandeza } from "@transformer-monitor/shared";
import type { LeituraMQTT } from "@transformer-monitor/shared";

type Props = {
  titulo: string;
  topico: string;
  leitura: LeituraMQTT | null;
};

export default function MetricCard({ titulo, topico, leitura }: Props) {
  const grandeza = mapearGrandeza(topico);
  const sev = grandeza && leitura ? avaliarSeveridade(grandeza, leitura.valor) : "ok";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{titulo}</span>
          <LedIndicator severity={sev} />
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold">
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
