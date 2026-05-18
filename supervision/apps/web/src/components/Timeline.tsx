import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Zap, Activity, Clock, ArrowDownAZ } from "lucide-react";
import type { AlertaHistorico, DiagnosticoResultado } from "@/hooks/useDashboard";

type Props = {
  historicoAlertas: AlertaHistorico[];
  historicoRisco: { ts: number; score: number }[];
  diagnostico: DiagnosticoResultado | null;
};

type EventoTimeline = {
  id: string;
  ts: number;        // unix seconds
  tipo: "alarme" | "inrush" | "risco" | "diagnostico";
  severidade: "ok" | "aviso" | "critico";
  titulo: string;
  descricao: string;
};

const TIPO_ICONE: Record<EventoTimeline["tipo"], React.ReactNode> = {
  alarme: <AlertTriangle className="h-4 w-4" />,
  inrush: <Zap className="h-4 w-4" />,
  risco: <Activity className="h-4 w-4" />,
  diagnostico: <AlertCircle className="h-4 w-4" />,
};

const SEV_COR: Record<string, string> = {
  critico: "bg-red-500 border-red-500 text-red-50",
  aviso: "bg-yellow-500 border-yellow-500 text-yellow-50",
  ok: "bg-green-500 border-green-500 text-green-50",
};

const SEV_TEXTO: Record<string, string> = {
  critico: "text-red-600 dark:text-red-400",
  aviso: "text-yellow-600 dark:text-yellow-400",
  ok: "text-green-600 dark:text-green-400",
};

const PERIODOS = [
  { label: "1h", segundos: 3600 },
  { label: "6h", segundos: 6 * 3600 },
  { label: "24h", segundos: 24 * 3600 },
  { label: "7d", segundos: 7 * 24 * 3600 },
];

const TIPOS_FILTRO: Array<{ valor: EventoTimeline["tipo"] | "todos"; label: string }> = [
  { valor: "todos", label: "Todos" },
  { valor: "alarme", label: "Alarmes" },
  { valor: "inrush", label: "Inrush" },
  { valor: "diagnostico", label: "Diagnósticos" },
];

function fmtTempo(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("pt-BR");
}

function fmtData(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("pt-BR");
}

export default function Timeline({ historicoAlertas, historicoRisco, diagnostico }: Props) {
  const [periodoSeg, setPeriodoSeg] = useState(3600);
  const [filtroTipo, setFiltroTipo] = useState<EventoTimeline["tipo"] | "todos">("todos");

  const eventos = useMemo<EventoTimeline[]>(() => {
    const list: EventoTimeline[] = [];
    const agoraSeg = Math.floor(Date.now() / 1000);
    const cutoff = agoraSeg - periodoSeg;

    // Alarmes do histórico (já tem ts + sev + tipo + valor + limite)
    for (const a of historicoAlertas) {
      const tsSec = a.timestamp > 1e12 ? Math.floor(a.timestamp / 1000) : a.timestamp;
      if (tsSec < cutoff) continue;
      const eInrush = a.topico.includes("inrush");
      list.push({
        id: a.id,
        ts: tsSec,
        tipo: eInrush ? "inrush" : "alarme",
        severidade: a.sev,
        titulo: eInrush ? "Inrush detectado" : `Alarme ${a.grandeza}`,
        descricao: `${a.valor}${a.unidade} (limite ${a.limite})${a.status === "resolvido" ? " — resolvido" : ""}`,
      });
    }

    // Diagnósticos críticos atuais (snapshot — apenas se severidade != ok)
    if (diagnostico && diagnostico.severidade_geral !== "ok" && diagnostico.timestamp) {
      const tsSec = diagnostico.timestamp;
      if (tsSec >= cutoff) {
        for (const d of diagnostico.diagnosticos.slice(0, 5)) {
          list.push({
            id: `diag-${tsSec}-${d.tipo}`,
            ts: tsSec,
            tipo: "diagnostico",
            severidade: d.severidade as "aviso" | "critico",
            titulo: d.titulo,
            descricao: d.mensagem,
          });
        }
      }
    }

    // Picos de risco (score >= 50) no histórico
    for (const r of historicoRisco) {
      if (r.ts < cutoff || r.score < 50) continue;
      list.push({
        id: `risco-${r.ts}`,
        ts: r.ts,
        tipo: "risco",
        severidade: r.score >= 75 ? "critico" : "aviso",
        titulo: `Risco elevado (${r.score.toFixed(0)})`,
        descricao: r.score >= 75 ? "Score em zona crítica" : "Score em zona de aviso",
      });
    }

    // Ordena decrescente (mais recente primeiro)
    list.sort((a, b) => b.ts - a.ts);

    if (filtroTipo !== "todos") {
      return list.filter((e) => e.tipo === filtroTipo);
    }
    return list;
  }, [historicoAlertas, historicoRisco, diagnostico, periodoSeg, filtroTipo]);

  // Agrupa por dia pra cabeçalho
  const eventosPorDia = useMemo(() => {
    const grupos: Record<string, EventoTimeline[]> = {};
    for (const e of eventos) {
      const dia = fmtData(e.ts);
      if (!grupos[dia]) grupos[dia] = [];
      grupos[dia].push(e);
    }
    return grupos;
  }, [eventos]);

  return (
    <Card className="ring-0 shadow-sm border-0">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Linha do Tempo de Eventos
          <Badge variant="secondary" className="ml-auto">{eventos.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 items-center mb-4 text-xs">
          <span className="font-medium">Período:</span>
          {PERIODOS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPeriodoSeg(p.segundos)}
              className={`px-2 py-1 rounded border ${periodoSeg === p.segundos ? "bg-primary text-primary-foreground border-primary" : "border-muted hover:bg-muted"}`}
            >
              {p.label}
            </button>
          ))}
          <span className="font-medium ml-3 inline-flex items-center gap-1">
            <ArrowDownAZ className="h-3 w-3" /> Tipo:
          </span>
          {TIPOS_FILTRO.map((t) => (
            <button
              key={t.valor}
              onClick={() => setFiltroTipo(t.valor)}
              className={`px-2 py-1 rounded border ${filtroTipo === t.valor ? "bg-primary text-primary-foreground border-primary" : "border-muted hover:bg-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {eventos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhum evento no período selecionado.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(eventosPorDia).map(([dia, items]) => (
              <div key={dia}>
                <div className="text-xs font-semibold text-muted-foreground mb-2 sticky top-0 bg-card py-1">
                  {dia}
                </div>
                <div className="relative pl-6">
                  <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-muted" />
                  <ul className="space-y-3">
                    {items.map((e) => {
                      const corCirculo = SEV_COR[e.severidade] ?? "bg-gray-500 border-gray-500";
                      const corTexto = SEV_TEXTO[e.severidade] ?? "text-gray-600";
                      return (
                        <li key={e.id} className="relative">
                          <span className={`absolute -left-[18px] top-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${corCirculo}`}>
                            <span className="h-1 w-1 rounded-full bg-white" />
                          </span>
                          <div className="flex items-start gap-2">
                            <span className={`mt-0.5 ${corTexto}`}>{TIPO_ICONE[e.tipo]}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium">{e.titulo}</span>
                                <Badge
                                  variant={e.severidade === "critico" ? "destructive" : "secondary"}
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {e.severidade.toUpperCase()}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                                  {fmtTempo(e.ts)}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">{e.descricao}</p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
