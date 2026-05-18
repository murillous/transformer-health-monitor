import { Card, CardContent } from "@/components/ui/card";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { Heart } from "lucide-react";

type Props = {
  saude?: { score: number; nivel: string } | null;
  className?: string;
};

const NIVEL_LABEL: Record<string, string> = {
  excelente: "Excelente",
  bom: "Bom",
  atencao: "Atenção",
  ruim: "Ruim",
  critico: "Crítico",
};

const NIVEL_COR: Record<string, string> = {
  excelente: "#22c55e", // green-500
  bom: "#84cc16",       // lime-500
  atencao: "#eab308",   // yellow-500
  ruim: "#f97316",      // orange-500
  critico: "#ef4444",   // red-500
};

const NIVEL_BORDA: Record<string, string> = {
  excelente: "border-l-green-500",
  bom: "border-l-lime-500",
  atencao: "border-l-yellow-500",
  ruim: "border-l-orange-500",
  critico: "border-l-red-500",
};

const NIVEL_TEXTO: Record<string, string> = {
  excelente: "text-green-600",
  bom: "text-lime-600",
  atencao: "text-yellow-600",
  ruim: "text-orange-600",
  critico: "text-red-600",
};

export default function HealthGauge({ saude, className }: Props) {
  const score = saude?.score ?? 0;
  const nivel = saude?.nivel ?? "atencao";
  const cor = NIVEL_COR[nivel] ?? "#9ca3af";
  const borda = NIVEL_BORDA[nivel] ?? "border-l-gray-400";
  const corTexto = NIVEL_TEXTO[nivel] ?? "text-gray-600";

  return (
    <Card className={`ring-0 shadow-sm border-0 border-l-4 ${borda} ${className ?? ""}`}>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs md:text-sm text-muted-foreground inline-flex items-center gap-1.5">
            <Heart className="h-4 w-4" />
            Índice de Saúde
          </span>
        </div>
        <div className="relative h-32 md:h-36">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              innerRadius="78%"
              outerRadius="100%"
              startAngle={210}
              endAngle={-30}
              data={[{ value: score, fill: cor }]}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar
                background={{ fill: "currentColor", fillOpacity: 0.1 }}
                dataKey="value"
                cornerRadius={6}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={`text-3xl md:text-4xl font-bold ${corTexto}`}>
              {score.toFixed(0)}%
            </span>
            <span className={`text-xs uppercase tracking-wide ${corTexto}`}>
              {NIVEL_LABEL[nivel] ?? nivel}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
