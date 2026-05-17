import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Brain, Lightbulb, Wrench, Clock, TrendingUp, TrendingDown, TrendingUpDown, Gauge } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import type { DiagnosticoResultado } from "@/hooks/useDashboard";

type Props = {
  diagnostico: DiagnosticoResultado | null;
  historicoRisco?: { ts: number; score: number }[];
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

function LifeBar({ consumido, taxa }: { consumido: number; taxa: number }) {
  const cor = consumido > 80 ? "bg-red-500" : consumido > 50 ? "bg-yellow-500" : "bg-green-500";
  const resto = Math.max(0, 100 - consumido);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1">
          <Gauge className="h-3 w-3" /> Vida Residual
        </span>
        <span className="font-medium">{resto.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${cor}`}
          style={{ width: `${Math.min(consumido, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Consumido: {consumido.toFixed(0)}%</span>
        <span>Taxa: {taxa.toFixed(2)}×</span>
      </div>
    </div>
  );
}

function PredicaoCard({ p }: { p: DiagnosticoResultado["predicoes"][number] }) {
  const corFundo = p.alarme_em === "critico" ? "bg-red-500/10 border-red-500/20" : "bg-yellow-500/10 border-yellow-500/20";
  const seta = p.tendencia === "subindo" ? <TrendingUp className="h-3 w-3 text-red-400" /> : <TrendingDown className="h-3 w-3 text-green-400" />;
  return (
    <div className={`flex items-start gap-2 p-2 rounded-md border ${corFundo}`}>
      <div className="shrink-0 mt-0.5">{seta}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{p.label}</div>
        <div className="text-[10px] text-muted-foreground">
          {p.valor_atual.toFixed(1)} → alarme em ~{p.tempo_para_alarme}min
        </div>
        <div className="text-[10px] text-muted-foreground">
          +{p.inclinacao.toFixed(1)}/hora
        </div>
      </div>
    </div>
  );
}

function Sparkline({ historico }: { historico: { ts: number; score: number }[] }) {
  if (historico.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground">
        Aguardando dados...
      </div>
    );
  }

  const data = historico.map((p) => ({ t: new Date(p.ts * 1000).toLocaleTimeString("pt-BR"), s: p.score }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 2, right: 2, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="hsl(var(--muted-foreground) / 0.15)" />
        <XAxis dataKey="t" hide />
        <YAxis domain={[0, 100]} hide />
        <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
        <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />
        <ReferenceLine y={25} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} />
        <Tooltip
          contentStyle={{ fontSize: 10, padding: "2px 6px" }}
          labelFormatter={(label) => label}
          formatter={(value) => [Number(value).toFixed(1), "Risco"]}
        />
        <Line type="monotone" dataKey="s" stroke="#8884d8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SeverityLED({ sev }: { sev: string }) {
  const cor =
    sev === "critico" ? "bg-red-500 shadow-red-500/50" :
    sev === "alto" || sev === "aviso" ? "bg-yellow-500 shadow-yellow-500/50" :
    "bg-green-500 shadow-green-500/50";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full animate-pulse ${cor}`} />;
}

const GRANDEZAS: Record<string, string> = {
  temperatura: "Temperatura",
  delta_t: "ΔT",
  vibracao_120hz: "Vibração 120Hz",
  vibracao_240hz: "Vibração 240Hz",
  corrente_primario: "Corrente Primário",
  corrente_secundario: "Corrente Secundário",
};

function fmtGrandeza(g: string): string {
  return GRANDEZAS[g] ?? g;
}

export default function DiagnosticoPanel({ diagnostico, historicoRisco = [] }: Props) {
  if (!diagnostico) {
    return (
      <Card className="ring-0 shadow-sm border-0">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Diagnóstico Inteligente
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Brain className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Aguardando dados do diagnóstico...</p>
            <p className="text-xs mt-1">O diagnóstico será exibido automaticamente quando houver leituras dos sensores.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { risco_operacional, urgencia_intervencao, diagnosticos, severidade_geral, timestamp, vida_residual, tendencias, predicoes } = diagnostico;
  const sevGeralLED =
    severidade_geral === "critico" ? "bg-red-500 shadow-red-500/50" :
    severidade_geral === "aviso" ? "bg-yellow-500 shadow-yellow-500/50" :
    "bg-green-500 shadow-green-500/50";

  const criticos = diagnosticos.filter((d) => d.severidade === "critico");
  const avisos = diagnosticos.filter((d) => d.severidade === "aviso");

  const ultimaAtualizacao = timestamp
    ? new Date(timestamp * 1000).toLocaleTimeString("pt-BR")
    : null;

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
          {ultimaAtualizacao && (
            <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {ultimaAtualizacao}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Risco Operacional</span>
              <RiskBar score={risco_operacional.score} nivel={risco_operacional.nivel} />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Urgência de Intervenção</span>
              <RiskBar score={urgencia_intervencao.score} nivel={urgencia_intervencao.nivel} />
            </div>
            {vida_residual && (
              <LifeBar consumido={vida_residual.consumido} taxa={vida_residual.taxa_atual} />
            )}
          </div>
          <div className="col-span-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" /> Evolução do Risco
            </div>
            <div className="h-16">
              <Sparkline historico={historicoRisco} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <TrendingUpDown className="h-3 w-3" /> Tendências
          </span>
          <div className="grid grid-cols-2 gap-2">
            {tendencias.map((t, i) => {
              const Seta = t.direcao === "subindo" ? TrendingUp : t.direcao === "descendo" ? TrendingDown : TrendingUpDown;
              const corSeta = t.direcao === "subindo" ? "text-red-400" : t.direcao === "descendo" ? "text-green-400" : "text-muted-foreground";
              return (
                <div key={`tend-${i}`} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                  <Seta className={`h-4 w-4 ${corSeta}`} />
                  <div className="text-xs">
                    <span className="font-medium">{t.label}</span>
                    <span className="ml-2 text-muted-foreground">
                      {t.direcao === "estavel" ? "estável" : `${Math.abs(t.inclinacao).toFixed(2)} ${t.unidade} ${t.direcao === "subindo" ? "↑" : "↓"}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {predicoes.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Predições — Alarme em Curso
            </span>
            <div className="grid grid-cols-2 gap-2">
              {predicoes.map((p, i) => (
                <PredicaoCard key={`pred-${i}`} p={p} />
              ))}
            </div>
          </div>
        )}

        {diagnosticos.length > 0 && (
          <div className="space-y-3">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Lightbulb className="h-3 w-3" /> Sugestões de Intervenção
            </span>

            {criticos.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">
                  Críticos ({criticos.length})
                </span>
                {criticos.map((d, i) => (
                  <IntervencaoCard key={`crit-${i}`} diag={d} />
                ))}
              </div>
            )}

            {avisos.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-yellow-500 uppercase tracking-wide">
                  Avisos ({avisos.length})
                </span>
                {avisos.map((d, i) => (
                  <IntervencaoCard key={`aviso-${i}`} diag={d} />
                ))}
              </div>
            )}
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

function IntervencaoCard({ diag }: { diag: DiagnosticoResultado["diagnosticos"][number] }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
      {diag.severidade === "critico" ? (
        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <SeverityLED sev={diag.severidade} />
          <Badge
            variant={diag.severidade === "critico" ? "destructive" : "secondary"}
            className="text-[10px] px-1.5 py-0"
          >
            {diag.severidade === "critico" ? "CRÍTICO" : "AVISO"}
          </Badge>
          <span className="text-xs font-medium truncate">{diag.titulo}</span>
        </div>
        <p className="text-xs text-foreground/90">{diag.mensagem}</p>
        <div className="flex items-center gap-3 mt-1">
          {diag.grandeza !== "multivariavel" && diag.valor_atual != null && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="font-medium">{fmtGrandeza(diag.grandeza)}:</span> {diag.valor_atual}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Wrench className="h-3 w-3" />
            <span>{diag.recomendacao}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
