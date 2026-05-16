import type { Registro, AlarmeMQTT } from "@transformer-monitor/shared";
import {
  inserirRegistro,
  inserirAlarme,
  registrosPorPeriodo as dbRegistrosPorPeriodo,
  historico as dbHistorico,
  consultarAlarmes,
  getAlarmes as dbGetAlarmes,
} from "./database";

export class DataStore {
  push(registro: Registro): void {
    inserirRegistro(registro);
  }

  pushAlarme(alarme: AlarmeMQTT): void {
    inserirAlarme(alarme);
  }

  historico(topico?: string): Registro[] {
    return dbHistorico(topico);
  }

  registrosPorPeriodo(inicio: Date, fim: Date): Registro[] {
    return dbRegistrosPorPeriodo(inicio, fim);
  }

  getAlarmes(): AlarmeMQTT[] {
    return dbGetAlarmes();
  }

  consultarAlarmes(params: {
    page?: number;
    limit?: number;
    severidade?: string;
    inicio?: Date;
    fim?: Date;
    grandeza?: string;
  }): { data: AlarmeMQTT[]; total: number; page: number; limit: number; totalPages: number } {
    return consultarAlarmes(params);
  }
}

export const store = new DataStore();
