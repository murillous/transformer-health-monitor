import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import type { LeituraMQTT } from "@transformer-monitor/shared";
import { avaliarSeveridade, mapearGrandeza, LIMITES } from "@transformer-monitor/shared";

type Props = {
  ultimosValores: Record<string, LeituraMQTT>;
};

const MENSAGENS: Record<string, string> = {
  temperatura: "Temperatura do núcleo elevada. Risco de degradação da isolação.",
  deltaT: "Gradiente térmico elevado para a carga atual. Possível curto parcial entre espiras.",
  vibracao120hz: "Vibração em 120Hz fora do padrão. Realizar aperto mecânico das chapas do núcleo.",
  correntePrimario: "Corrente primária acima do esperado. Verificar carga e condições da rede.",
};

export default function AlertsPanel({ ultimosValores }: Props) {
  const alertas: { grandeza: string; sev: "aviso" | "critico"; mensagem: string }[] = [];

  for (const [topico, leitura] of Object.entries(ultimosValores)) {
    const grandeza = mapearGrandeza(topico);
    if (!grandeza) continue;
    const sev = avaliarSeveridade(grandeza, leitura.valor);
    if (sev === "ok") continue;
    const lim = LIMITES[grandeza];
    const base = MENSAGENS[grandeza] ?? `Alerta: ${grandeza} = ${leitura.valor}`;
    const complemento = sev === "critico"
      ? ` Valor crítico: ${leitura.valor}${leitura.unidade} (limite: ${lim.critico}${leitura.unidade})`
      : ` Valor: ${leitura.valor}${leitura.unidade} (limite: ${lim.aviso}${leitura.unidade})`;
    alertas.push({ grandeza, sev, mensagem: base + complemento });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Alertas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alertas.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Todos os parâmetros normais
          </div>
        ) : (
          <div className="space-y-2">
            {alertas.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {a.sev === "critico" ? (
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                )}
                <div>
                  <Badge
                    variant={a.sev === "critico" ? "destructive" : "secondary"}
                    className="mr-1"
                  >
                    {a.sev.toUpperCase()}
                  </Badge>
                  {a.mensagem}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
