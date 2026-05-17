import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

type Props = {
  dados: { freq: number; amplitude: number }[];
};

const chartConfig = {
  amplitude: { label: "Amplitude (g)", color: "#f59e0b" },
} satisfies ChartConfig;

export default function SpectrumChart({ dados }: Props) {
  return (
    <Card className="ring-0 shadow-sm border-0">
      <CardHeader>
        <CardTitle className="text-sm">Espectro de Vibração (FFT)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
          <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="freq"
              tickFormatter={(v) => `${v}Hz`}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              type="number"
              domain={[0, 250]}
              ticks={[0, 60, 120, 180, 240]}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, "auto"]} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_v, p) => {
                    const freq = p?.[0]?.payload?.freq;
                    return freq ? `${freq} Hz` : "";
                  }}
                  formatter={(value) => `${Number(value ?? 0).toFixed(3)} g`}
                />
              }
            />
            <ReferenceLine x={120} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} />
            <ReferenceLine x={240} stroke="#8b5cf6" strokeDasharray="4 4" strokeWidth={1.5} />
            <Bar
              dataKey="amplitude"
              fill="var(--color-amplitude)"
              radius={[2, 2, 0, 0]}
              maxBarSize={20}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
