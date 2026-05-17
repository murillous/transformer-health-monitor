import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

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

  return (
    <div className="rounded-lg bg-black/90 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-green-400/80">{titulo}</span>
        {amostras.length > 0 && (
          <span className="text-[9px] font-mono text-green-400/60">
            {amostras.length} pts | {Math.max(...amostras).toFixed(2)} pico
          </span>
        )}
      </div>
      <div className="h-20">
        {amostras.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <YAxis domain={[-1.5, 1.5]} hide />
              <Line
                type="monotone"
                dataKey="v"
                stroke={cor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-[10px] text-green-400/40 font-mono">
            -- -- -- Sem sinal -- -- --
          </div>
        )}
      </div>
    </div>
  );
}
