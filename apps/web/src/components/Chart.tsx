import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={dados}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => new Date(v).toLocaleTimeString()}
              fontSize={11}
              stroke="#9ca3af"
            />
            <YAxis fontSize={11} stroke="#9ca3af" />
            <Tooltip
              labelFormatter={(v) => new Date(v).toLocaleTimeString()}
            />
            {series.map((s) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.nome}
                stroke={s.cor}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
