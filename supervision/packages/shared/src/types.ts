import { z } from "zod";

export const leituraSchema = z.object({
  ts: z.number(),
  valor: z.number(),
  unidade: z.string(),
});
export type LeituraMQTT = z.infer<typeof leituraSchema>;

export const alarmeSchema = z.object({
  ts: z.number(),
  tipo: z.string(),
  sev: z.enum(["aviso", "critico"]),
  valor: z.number(),
  limite: z.number(),
});
export type AlarmeMQTT = z.infer<typeof alarmeSchema>;

export type Severidade = "ok" | "aviso" | "critico";

export interface Registro {
  timestamp: string;
  topico: string;
  valor: number;
  unidade: string;
  alarme: string;
}

export interface DadosDashboard {
  topicos: Record<string, { valor: number; unidade: string; ts: number }>;
  alarmes: AlarmeMQTT[];
}
