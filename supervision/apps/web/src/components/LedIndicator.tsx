import { cn } from "@/lib/utils";
import type { Severidade } from "@transformer-monitor/shared";

type Props = {
  severity: Severidade;
};

const cores: Record<Severidade, string> = {
  ok: "bg-green-500 shadow-green-500/50",
  aviso: "bg-yellow-500 shadow-yellow-500/50",
  critico: "bg-red-500 shadow-red-500/50",
};

export default function LedIndicator({ severity }: Props) {
  return (
    <span
      className={cn(
        "inline-block h-3 w-3 rounded-full shadow-lg animate-pulse",
        cores[severity]
      )}
    />
  );
}
