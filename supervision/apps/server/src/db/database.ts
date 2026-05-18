import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Registro, AlarmeMQTT } from "@transformer-monitor/shared";

const DB_PATH = path.resolve(process.cwd(), "data", "monitor.db");

let db: Database.Database;

export function getDB(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    inicializarTabelas();
  }
  return db;
}

function inicializarTabelas(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      topico TEXT NOT NULL,
      valor REAL NOT NULL,
      unidade TEXT NOT NULL,
      alarme TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS alarmes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      sev TEXT NOT NULL CHECK(sev IN ('aviso', 'critico')),
      valor REAL NOT NULL,
      limite REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_registros_timestamp ON registros(timestamp);
    CREATE INDEX IF NOT EXISTS idx_registros_topico ON registros(topico);
    CREATE INDEX IF NOT EXISTS idx_alarmes_ts ON alarmes(ts);
    CREATE INDEX IF NOT EXISTS idx_alarmes_sev ON alarmes(sev);
    CREATE INDEX IF NOT EXISTS idx_alarmes_tipo ON alarmes(tipo);
  `);
}

export function inserirRegistro(registro: Registro): void {
  const stmt = getDB().prepare(
    `INSERT INTO registros (timestamp, topico, valor, unidade, alarme) VALUES (@timestamp, @topico, @valor, @unidade, @alarme)`
  );
  stmt.run(registro);
}

export function inserirAlarme(alarme: AlarmeMQTT): void {
  const stmt = getDB().prepare(
    `INSERT INTO alarmes (ts, tipo, sev, valor, limite) VALUES (@ts, @tipo, @sev, @valor, @limite)`
  );
  stmt.run(alarme);
}

export function registrosPorPeriodo(inicio: Date, fim: Date): Registro[] {
  const stmt = getDB().prepare(
    `SELECT timestamp, topico, valor, unidade, alarme FROM registros WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`
  );
  return stmt.all(inicio.toISOString(), fim.toISOString()) as Registro[];
}

export function historico(topico?: string): Registro[] {
  if (topico) {
    const stmt = getDB().prepare(
      `SELECT timestamp, topico, valor, unidade, alarme FROM registros WHERE topico = ? ORDER BY timestamp DESC`
    );
    return stmt.all(topico) as Registro[];
  }
  const stmt = getDB().prepare(
    `SELECT timestamp, topico, valor, unidade, alarme FROM registros ORDER BY timestamp DESC`
  );
  return stmt.all() as Registro[];
}

export function consultarAlarmes(params: {
  page?: number;
  limit?: number;
  severidade?: string;
  inicio?: Date;
  fim?: Date;
  grandeza?: string;
}): { data: AlarmeMQTT[]; total: number; page: number; limit: number; totalPages: number } {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.severidade) {
    conditions.push("sev = ?");
    values.push(params.severidade);
  }
  if (params.inicio) {
    conditions.push("ts >= ?");
    values.push(Math.floor(params.inicio.getTime() / 1000));
  }
  if (params.fim) {
    conditions.push("ts <= ?");
    values.push(Math.floor(params.fim.getTime() / 1000));
  }
  if (params.grandeza) {
    conditions.push("tipo = ?");
    values.push(params.grandeza);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = getDB().prepare(`SELECT COUNT(*) as count FROM alarmes ${where}`).get(...values) as { count: number };
  const total = totalRow.count;

  const rows = getDB().prepare(
    `SELECT ts, tipo, sev, valor, limite FROM alarmes ${where} ORDER BY ts DESC LIMIT ? OFFSET ?`
  ).all(...values, limit, offset) as AlarmeMQTT[];

  return {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export function getAlarmes(): AlarmeMQTT[] {
  const stmt = getDB().prepare(`SELECT ts, tipo, sev, valor, limite FROM alarmes ORDER BY ts DESC`);
  return stmt.all() as AlarmeMQTT[];
}

export function fecharDB(): void {
  if (db) {
    db.close();
  }
}
