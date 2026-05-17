import fs from "fs";
import path from "path";
import type { Registro, AlarmeMQTT } from "@transformer-monitor/shared";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATE_FILE = () => new Date().toISOString().slice(0, 10);
const REG_PATH = () => path.join(DATA_DIR, `datalog_${DATE_FILE()}.csv`);
const ALM_PATH = () => path.join(DATA_DIR, `alarmes_${DATE_FILE()}.csv`);

let regHeader = false;
let almHeader = false;

export function csvPush(registro: Registro): void {
  const hoje = DATE_FILE();
  const rpath = path.join(DATA_DIR, `datalog_${hoje}.csv`);

  if (!regHeader) {
    if (!fs.existsSync(rpath)) {
      fs.writeFileSync(rpath, "timestamp,topico,valor,unidade\n");
    }
    regHeader = true;
  }

  fs.appendFileSync(rpath, `${registro.timestamp},${registro.topico},${registro.valor},${registro.unidade}\n`);
}

export function csvPushAlarme(alarme: AlarmeMQTT): void {
  const hoje = DATE_FILE();
  const apath = path.join(DATA_DIR, `alarmes_${hoje}.csv`);

  if (!almHeader) {
    if (!fs.existsSync(apath)) {
      fs.writeFileSync(apath, "timestamp,tipo,severidade,valor,limite\n");
    }
    almHeader = true;
  }

  fs.appendFileSync(apath, `${alarme.ts},${alarme.tipo},${alarme.sev},${alarme.valor},${alarme.limite}\n`);
}

export function resetCsvHeaders(): void {
  regHeader = false;
  almHeader = false;
}
