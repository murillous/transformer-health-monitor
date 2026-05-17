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

let jaAnimouGlobal = false;

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
    const ponto: Record<string, number | string> = { timestamp: ts };
    for (const s of series) {
      const p = s.pontos.find((p) => p.timestamp === ts);
      if (p) ponto[s.dataKey] = p.valor;
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

  const animar = !jaAnimouGlobal && series.some((s) => s.pontos.length > 0);
  if (animar) jaAnimouGlobal = true;

  return (
    <Card className="ring-0 shadow-sm border-0">
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
            <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, "auto"]} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_value, payload) => {
                    const ts = payload?.[0]?.payload?.timestamp;
                    return ts ? new Date(ts).toLocaleTimeString() : "";
                  }}
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
                isAnimationActive={animar}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
