import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type Props = {
  titulo: string;
  amostras: number[];
  cor?: string;
};

export default function WaveformChart({ titulo, amostras, cor = "#22c55e" }: Props) {
  const data = useMemo(() => {
    if (amostras.length === 0) return [];
    return amostras.map((v, i) => ({ i, v }));
  }, [amostras]);

  const chartConfig = {
    v: { label: "Amplitude", color: cor },
  } satisfies ChartConfig;

  return (
    <Card className="ring-0 shadow-sm border-0">
      <CardHeader>
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
          <LineChart data={data} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="i" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={["auto", "auto"]} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_v, p) => {
                    const i = p?.[0]?.payload?.i;
                    return i != null ? `Amostra ${i}` : "";
                  }}
                  formatter={(value) => `${Number(value ?? 0).toFixed(3)}`}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke={`var(--color-v)`}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
