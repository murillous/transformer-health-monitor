import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, CheckCircle2, X } from "lucide-react";
import type { LeituraMQTT } from "@transformer-monitor/shared";
import { avaliarSeveridade, mapearGrandeza } from "@transformer-monitor/shared";

type Props = {
  ultimosValores: Record<string, LeituraMQTT>;
};

interface Alerta {
  id: string;
  sev: "aviso" | "critico";
  mensagem: string;
}

const MENSAGENS: Record<string, Record<string, string>> = {
  temperatura: {
    aviso: "Temperatura do núcleo elevada. Monitorar degradação da isolação.",
    critico: "CRÍTICO: Temperatura acima do limite. Risco de curto parcial entre espiras. Reduzir carga imediatamente.",
  },
  deltaT: {
    aviso: "AVISO EFICIÊNCIA: Gradiente térmico elevado para a carga atual. Monitorar degradação da relação Pin/Pout.",
    critico: "CRÍTICO: ΔT excessivo. Degradação da eficiência iminente de curto parcial entre espiras.",
  },
  vibracao120hz: {
    aviso: "MANUTENÇÃO: Vibração 120Hz acima do padrão. Realizar aperto mecânico das chapas do núcleo magnético.",
    critico: "CRÍTICO: Vibração 120Hz muito elevada. Risco de dano estrutural ao núcleo.",
  },
  correntePrimario: {
    aviso: "Corrente primária elevada. Verificar carga e condições da rede.",
    critico: "CRÍTICO: Sobrecarga no primário. Risco de danos ao enrolamento.",
  },
  correnteSecundario: {
    aviso: "Corrente secundária elevada. Verificar carga conectada.",
    critico: "CRÍTICO: Sobrecarga no secundário. Risco de aquecimento excessivo.",
  },
  vibracao240hz: {
    aviso: "Ruído harmônico detectado (240Hz). Possível distorção na rede.",
    critico: "CRÍTICO: Elevado ruído harmônico (THD). Sugere-se projeto de filtros EMI/RFI.",
  },
};

export default function AlertsPanel({ ultimosValores }: Props) {
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  const alertas: Alerta[] = [];

  // Check each monitored grandeza
  for (const [topico, leitura] of Object.entries(ultimosValores)) {
    const grandeza = mapearGrandeza(topico);
    if (!grandeza) continue;
    const sev = avaliarSeveridade(grandeza, leitura.valor);
    if (sev === "ok") continue;
    const msgs = MENSAGENS[grandeza];
    const mensagem = msgs?.[sev] ?? `${grandeza}: ${leitura.valor}${leitura.unidade}`;
    const id = `${grandeza}-${sev}`;
    alertas.push({ id, sev, mensagem });
  }

  // Additional cross-variable diagnostics
  const correntePrimario = ultimosValores["transformador/primario/corrente"];
  const correnteSecundario = ultimosValores["transformador/secundario/corrente"];
  const temperatura = ultimosValores["transformador/nucleo/temperatura"];
  const deltaT = ultimosValores["transformador/nucleo/delta_t"];

  // Arco elétrico / centelhamento: detectado via salto de temperatura + corrente anormal
  if (temperatura && correntePrimario && correnteSecundario) {
    const ratio = correntePrimario.valor > 0 ? correnteSecundario.valor / correntePrimario.valor : 0;
    if (ratio > 20 && temperatura.valor > 60) {
      alertas.push({
        id: "arco-eletrico",
        sev: "critico",
        mensagem: "CRÍTICO: Salto de fase ou centelhamento detectado. Risco de arco elétrico. Inspecionar bornes e conexões imediatamente.",
      });
    }
  }

  // Eficiência: degradação detectada por deltaT elevado + corrente normal
  if (deltaT && temperatura && deltaT.valor > 15 && temperatura.valor > 50) {
    alertas.push({
      id: "eficiencia",
      sev: "aviso",
      mensagem: "AVISO EFICIÊNCIA: Degradação da relação Pin/Pout. Possível curto parcial entre espiras em desenvolvimento.",
    });
  }

  const visibleAlerts = alertas.filter((a) => !acknowledged.has(a.id));

  const handleAcknowledge = (id: string) => {
    setAcknowledged((prev) => new Set(prev).add(id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Alertas {visibleAlerts.length > 0 && <Badge variant="destructive">{visibleAlerts.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {visibleAlerts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Todos os parâmetros normais
          </div>
        ) : (
          <div className="space-y-3">
            {visibleAlerts.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-sm">
                {a.sev === "critico" ? (
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                )}
                <div className="flex-1">
                  <Badge
                    variant={a.sev === "critico" ? "destructive" : "secondary"}
                    className="mr-1"
                  >
                    {a.sev === "critico" ? "CRÍTICO" : "AVISO"}
                  </Badge>
                  {a.mensagem}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAcknowledge(a.id)}
                  className="h-6 w-6 p-0 shrink-0"
                  title="Reconhecer (Acknowledge)"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
