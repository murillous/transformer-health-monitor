import { AlertTriangle, Clock } from "lucide-react";
import type { DiagnosticoResultado } from "@/hooks/useDashboard";

type Props = {
  predicoes: DiagnosticoResultado["predicoes"];
  onNavigate?: () => void;
};

// Banner que surfaca predições urgentes (< 60min até alarme) no topo do painel.
// Surge automaticamente quando há previsão de cruzar limiar em curto prazo.
export default function PredicoesBanner({ predicoes, onNavigate }: Props) {
  const urgentes = (predicoes ?? []).filter((p) => p.tempo_para_alarme < 60);
  if (urgentes.length === 0) return null;

  const tematica = urgentes.some((p) => p.alarme_em === "critico")
    ? { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-500", text: "text-red-700 dark:text-red-300", icon: "text-red-500" }
    : { bg: "bg-yellow-50 dark:bg-yellow-950/30", border: "border-yellow-500", text: "text-yellow-700 dark:text-yellow-300", icon: "text-yellow-500" };

  return (
    <div
      className={`border-l-4 ${tematica.border} ${tematica.bg} p-3 rounded-r-md cursor-pointer hover:opacity-90 transition-opacity`}
      onClick={onNavigate}
      role="alert"
    >
      <div className={`flex items-center gap-2 mb-1.5 font-semibold text-sm ${tematica.text}`}>
        <AlertTriangle className={`h-4 w-4 ${tematica.icon}`} />
        Alertas Preditivos ({urgentes.length})
      </div>
      <ul className="space-y-1 text-xs">
        {urgentes.map((p, i) => (
          <li key={`pred-${i}`} className={`flex items-center gap-2 ${tematica.text}`}>
            <Clock className="h-3 w-3 shrink-0" />
            <span className="font-medium">{p.label}</span>
            <span className="opacity-90">
              entra em <strong>{p.alarme_em}</strong> em ~{p.tempo_para_alarme} min
              <span className="opacity-70"> (slope {p.inclinacao.toFixed(2)}/h, valor atual {p.valor_atual.toFixed(2)})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
