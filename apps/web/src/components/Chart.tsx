import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type Ponto = { timestamp: number; valor: number };

type Serie = {
  dataKey: string;
  nome: string;
  cor: string;
  pontos: Ponto[];
};

type Props = {
  titulo: string;
  series: Serie[];
};

export default function Chart({ titulo, series }: Props) {
  const timestamps = [
    ...new Set(series.flatMap((s) => s.pontos.map((p) => p.timestamp))),
  ].sort();

  const dados = timestamps.map((ts) => {
    const ponto: Record<string, number | string | null> = { timestamp: ts };
    for (const s of series) {
      const p = s.pontos.find((p) => p.timestamp === ts);
      ponto[s.dataKey] = p?.valor ?? null;
    }
    return ponto;
  });

  const chartConfig: ChartConfig = {};
  for (const s of series) {
    chartConfig[s.dataKey] = {
      label: s.nome,
      color: s.cor,
    };
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
          <LineChart data={dados} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => new Date(v).toLocaleTimeString()}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(v) => new Date(v).toLocaleTimeString()}
                />
              }
            />
            {series.map((s) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                stroke={`var(--color-${s.dataKey})`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
