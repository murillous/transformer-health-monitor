import * as fs from "fs";
import * as path from "path";
import type { Registro, AlarmeMQTT } from "@transformer-monitor/shared";

const MAX_REGISTROS = 10000;
const CSV_DIR = path.resolve(process.cwd(), "data");

export class DataStore {
  private registros: Registro[] = [];
  private alarmes: AlarmeMQTT[] = [];

  push(registro: Registro): void {
    this.registros.push(registro);
    if (this.registros.length > MAX_REGISTROS) {
      this.registros.shift();
    }
    this.appendCSV(registro);
  }

  pushAlarme(alarme: AlarmeMQTT): void {
    this.alarmes.push(alarme);
    if (this.alarmes.length > 1000) this.alarmes.shift();
  }

  historico(topico?: string): Registro[] {
    if (topico) return this.registros.filter((r) => r.topico === topico);
    return [...this.registros];
  }

  registrosPorPeriodo(inicio: Date, fim: Date): Registro[] {
    return this.registros.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= inicio.getTime() && t <= fim.getTime();
    });
  }

  getAlarmes(): AlarmeMQTT[] {
    return [...this.alarmes];
  }

  private appendCSV(registro: Registro): void {
    if (!fs.existsSync(CSV_DIR)) fs.mkdirSync(CSV_DIR, { recursive: true });
    const hoje = new Date().toISOString().slice(0, 10);
    const filePath = path.join(CSV_DIR, `historico_${hoje}.csv`);
    const cabecalho = "timestamp,topico,valor,unidade,alarme\n";
    const existe = fs.existsSync(filePath);
    const linha = `${registro.timestamp},${registro.topico},${registro.valor},${registro.unidade},${registro.alarme}\n`;
    if (!existe) fs.writeFileSync(filePath, cabecalho + linha);
    else fs.appendFileSync(filePath, linha);
  }
}

export const store = new DataStore();
