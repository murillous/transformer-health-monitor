# Supervision Software Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TypeScript supervision software (P5+P6) for Transformer Health Monitor — Express backend consuming MQTT + React dashboard with real-time WebSocket + PDF report generation.

**Architecture:** Monorepo (Turborepo) with 3 packages: `shared` (types/zod), `server` (Express + mqtt.js + ws + Puppeteer), `web` (Vite + React + Shadcn + Recharts). Express serves everything on one port in production.

**Tech Stack:** TypeScript, Express, React, Vite, Shadcn (preset `b5Zxfi1RY9`), Tailwind, Recharts, WebSocket (`ws`), `mqtt.js`, Zod, Puppeteer, Turborepo

**Deadline:** 18/05/2026

---

### Task 1: Root Workspace Setup

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "transformer-monitor",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {}
  }
}
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Update .gitignore**

```
node_modules/
dist/
.turbo/
*.log
.env
```

- [ ] **Step 5: Install root dependencies and verify**

Run: `npm install` in the root directory

---

### Task 2: Shared Package (types, constants, zod)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/constants.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@transformer-monitor/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create src/types.ts**

```ts
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
```

- [ ] **Step 4: Create src/constants.ts**

```ts
import type { Severidade } from "./types";

export const TOPICOS_MQTT = {
  correntePrimario: "transformador/primario/corrente",
  correnteSecundario: "transformador/secundario/corrente",
  temperaturaNucleo: "transformador/nucleo/temperatura",
  deltaT: "transformador/nucleo/delta_t",
  vibracao120hz: "transformador/vibracao/fft_120hz",
  vibracao240hz: "transformador/vibracao/fft_240hz",
  alarme: "transformador/status/alarme",
  heartbeat: "transformador/status/heartbeat",
} as const;

export const TOPICOS_INSCREVER = Object.values(TOPICOS_MQTT);

export const LIMITES: Record<string, { aviso: number; critico: number }> = {
  temperatura: { aviso: 70, critico: 85 },
  deltaT: { aviso: 15, critico: 25 },
  vibracao120hz: { aviso: 0.2, critico: 0.45 },
  correntePrimario: { aviso: 4.0, critico: 6.0 },
};

export function avaliarSeveridade(
  grandeza: string,
  valor: number
): Severidade {
  const limites = LIMITES[grandeza];
  if (!limites) return "ok";
  if (valor >= limites.critico) return "critico";
  if (valor >= limites.aviso) return "aviso";
  return "ok";
}

export function mapearGrandeza(topico: string): string | null {
  const mapa: Record<string, string> = {
    [TOPICOS_MQTT.temperaturaNucleo]: "temperatura",
    [TOPICOS_MQTT.deltaT]: "deltaT",
    [TOPICOS_MQTT.vibracao120hz]: "vibracao120hz",
    [TOPICOS_MQTT.correntePrimario]: "correntePrimario",
  };
  return mapa[topico] ?? null;
}
```

- [ ] **Step 5: Create src/index.ts**

```ts
export * from "./types";
export * from "./constants";
```

- [ ] **Step 6: Install shared dependencies**

Run: `npm install` from root

---

### Task 3: Server Scaffold

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/main.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@transformer-monitor/server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@transformer-monitor/shared": "*",
    "express": "^4.19.0",
    "mqtt": "^5.5.0",
    "ws": "^8.17.0",
    "puppeteer": "^22.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/ws": "^8.5.10",
    "@types/node": "^20.12.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "commonjs",
    "moduleResolution": "node"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create src/main.ts (skeleton)**

```ts
import express from "express";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
});
```

- [ ] **Step 4: Install server dependencies**

Run: `npm install` from root

- [ ] **Step 5: Verify server starts**

Run: `npx tsx apps/server/src/main.ts` — should show "Server running on :3001"
Kill the process after verifying.

---

### Task 4: Server DataStore (Memory + CSV)

**Files:**
- Create: `apps/server/src/db/store.ts`

- [ ] **Step 1: Create src/db/store.ts**

```ts
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
```

---

### Task 5: Server MQTT Subscriber

**Files:**
- Create: `apps/server/src/mqtt/subscriber.ts`

- [ ] **Step 1: Create src/mqtt/subscriber.ts**

```ts
import mqtt from "mqtt";
import { EventEmitter } from "events";
import {
  leituraSchema,
  TOPICOS_INSCREVER,
} from "@transformer-monitor/shared";
import { store } from "../db/store";

export class MQTTSubscriber extends EventEmitter {
  private client: mqtt.MqttClient | null = null;

  connect(brokerUrl = "mqtt://localhost:1883"): void {
    this.client = mqtt.connect(brokerUrl);

    this.client.on("connect", () => {
      console.log(`MQTT conectado em ${brokerUrl}`);
      this.client!.subscribe(TOPICOS_INSCREVER, (err) => {
        if (err) console.error("Erro ao subscrever:", err);
        else console.log(`Inscrito em ${TOPICOS_INSCREVER.length} tópicos`);
      });
    });

    this.client.on("message", (topico, payload) => {
      try {
        const parsed = JSON.parse(payload.toString());
        const data = leituraSchema.parse(parsed);

        store.push({
          timestamp: new Date().toISOString(),
          topico,
          valor: data.valor,
          unidade: data.unidade,
          alarme: "",
        });

        if (topico === "transformador/status/alarme") {
          store.pushAlarme({ ...data, tipo: topico, sev: "aviso", limite: 0 });
        }

        this.emit("leitura", { topico, ...data });
      } catch (err) {
        console.error(`Payload inválido no tópico ${topico}:`, err);
      }
    });

    this.client.on("error", (err) => {
      console.error("MQTT error:", err);
    });
  }

  disconnect(): void {
    this.client?.end();
  }
}
```

---

### Task 6: Server WebSocket Hub

**Files:**
- Create: `apps/server/src/ws/hub.ts`

- [ ] **Step 1: Create src/ws/hub.ts**

```ts
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

export class WebSocketHub {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      console.log(`WS cliente conectado (${this.clients.size} total)`);

      ws.on("close", () => {
        this.clients.delete(ws);
        console.log(`WS cliente desconectado (${this.clients.size} total)`);
      });

      ws.on("error", (err) => {
        console.error("WS error:", err);
        this.clients.delete(ws);
      });
    });
  }

  broadcast(data: object): void {
    const msg = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }
}
```

---

### Task 7: Server API Routes

**Files:**
- Create: `apps/server/src/api/historico.ts`
- Create: `apps/server/src/api/relatorio.ts`

- [ ] **Step 1: Create src/api/historico.ts**

```ts
import { Router } from "express";
import { store } from "../db/store";

const router = Router();

router.get("/", (req, res) => {
  const { inicio, fim, topico } = req.query;

  if (inicio && fim) {
    const data = store.registrosPorPeriodo(
      new Date(inicio as string),
      new Date(fim as string)
    );
    return res.json(data);
  }

  res.json(store.historico(topico as string | undefined));
});

router.get("/alarmes", (_req, res) => {
  res.json(store.getAlarmes());
});

export default router;
```

- [ ] **Step 2: Create src/api/relatorio.ts**

```ts
import { Router } from "express";
import puppeteer from "puppeteer";
import { store } from "../db/store";
import {
  avaliarSeveridade,
  mapearGrandeza,
  LIMITES,
} from "@transformer-monitor/shared";

const router = Router();

function gerarHTML(inicio: string, fim: string): string {
  const inicioDate = new Date(inicio);
  const fimDate = new Date(fim);
  const registros = store.registrosPorPeriodo(inicioDate, fimDate);
  const alarmes = store.getAlarmes();

  const topicosUnicos = [...new Set(registros.map((r) => r.topico))];
  const medias = topicosUnicos.map((topico) => {
    const vals = registros.filter((r) => r.topico === topico).map((r) => r.valor);
    const media = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    return { topico, media: media.toFixed(2), unidade: registros.find((r) => r.topico === topico)?.unidade ?? "" };
  });

  const linhasDiagnostico = medias
    .map((m) => {
      const grandeza = mapearGrandeza(m.topico);
      if (!grandeza) return null;
      const sev = avaliarSeveridade(grandeza, parseFloat(m.media));
      if (sev === "ok") return null;
      const lim = LIMITES[grandeza];
      return `<tr>
        <td>${m.topico}</td>
        <td>${m.media} ${m.unidade}</td>
        <td style="color:${sev === "critico" ? "red" : "orange"}; font-weight:bold">${sev.toUpperCase()}</td>
        <td>${sev === "critico" ? `Acima de ${lim.critico} ${m.unidade}` : `Acima de ${lim.aviso} ${m.unidade}`}</td>
      </tr>`;
    })
    .filter(Boolean)
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
  h1 { color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 8px; }
  h2 { color: #374151; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #d1d5db; padding: 10px 12px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  .info { color: #6b7280; font-size: 14px; }
  .footer { margin-top: 40px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style></head><body>
  <h1>Relatório de Diagnóstico — Transformer Health Monitor</h1>
  <p class="info">Gerado em: ${new Date().toISOString()}</p>
  <p class="info">Período: ${inicio} a ${fim}</p>
  <h2>Médias por Grandeza</h2>
  <table><thead><tr><th>Grandeza</th><th>Média</th></tr></thead>
    <tbody>${medias.map((m) => `<tr><td>${m.topico}</td><td>${m.media} ${m.unidade}</td></tr>`).join("")}</tbody>
  </table>
  <h2>Alertas no Período</h2>
  ${alarmes.length === 0 ? "<p>Nenhum alerta registrado.</p>" : `<table><thead><tr><th>Timestamp</th><th>Tipo</th><th>Severidade</th><th>Valor</th></tr></thead>
    <tbody>${alarmes.map((a) => `<tr><td>${new Date(a.ts * 1000).toISOString()}</td><td>${a.tipo}</td><td style="color:${a.sev === "critico" ? "red" : "orange"}">${a.sev.toUpperCase()}</td><td>${a.valor}</td></tr>`).join("")}</tbody>
  </table>`}
  <h2>Diagnóstico</h2>
  ${linhasDiagnostico ? `<table><thead><tr><th>Grandeza</th><th>Valor</th><th>Severidade</th><th>Recomendação</th></tr></thead><tbody>${linhasDiagnostico}</tbody></table>` : "<p>Todos os parâmetros dentro da normalidade.</p>"}
  <div class="footer">Transformer Health Monitor — Projeto Integrador Microcontroladores 2026</div>
</body></html>`;
}

router.post("/", async (req, res) => {
  try {
    const { inicio, fim } = req.body;
    if (!inicio || !fim) {
      return res.status(400).json({ error: "Parâmetros 'inicio' e 'fim' são obrigatórios" });
    }

    const html = gerarHTML(inicio, fim);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html);
    const pdf = await page.pdf({ format: "A4", margin: { top: "20mm", bottom: "20mm" } });
    await browser.close();

    res.set({ "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=relatorio-transformador.pdf" });
    res.send(pdf);
  } catch (err) {
    console.error("Erro ao gerar PDF:", err);
    res.status(500).json({ error: "Erro ao gerar relatório" });
  }
});

export default router;
```

---

### Task 8: Server Main Entry (Wire Everything)

**Files:**
- Modify: `apps/server/src/main.ts`

- [ ] **Step 1: Update src/main.ts**

```ts
import express from "express";
import http from "http";
import path from "path";
import { MQTTSubscriber } from "./mqtt/subscriber";
import { WebSocketHub } from "./ws/hub";
import historicoRouter from "./api/historico";
import relatorioRouter from "./api/relatorio";
import { TOPICOS_MQTT } from "@transformer-monitor/shared";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

app.use(express.json());

// API
app.use("/api/historico", historicoRouter);
app.use("/api/relatorio", relatorioRouter);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Serve frontend build em produção
const distPath = path.resolve(__dirname, "../../web/dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// WebSocket hub
const wsHub = new WebSocketHub(server);

// MQTT subscriber → broadcast via WS
const mqttSub = new MQTTSubscriber();
mqttSub.on("leitura", (data) => {
  wsHub.broadcast(data);
});
mqttSub.connect(process.env.MQTT_BROKER || "mqtt://localhost:1883");

server.listen(PORT, () => {
  console.log(`Server rodando em :${PORT}`);
});
```

---

### Task 9: Frontend Scaffold (Vite + Shadcn + preset)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/index.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@transformer-monitor/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@transformer-monitor/shared": "*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "recharts": "^2.12.0",
    "lucide-react": "^0.378.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create tailwind.config.ts**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create postcss.config.js**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create index.html**

```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Transformer Health Monitor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9: Create src/lib/utils.ts**

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 10: Create src/main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 11: Create src/App.tsx**

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Relatorio from "./pages/Relatorio";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/relatorio" element={<Relatorio />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
```

- [ ] **Step 12: Initialize Shadcn with preset**

Run: `cd apps/web && npx shadcn@latest init --preset b2DLVcgnT --force`

- [ ] **Step 13: Add Shadcn components needed**

Run:
```bash
cd apps/web
npx shadcn@latest add card button badge select
```

- [ ] **Step 14: Install frontend dependencies**

Run: `npm install` from root

---

### Task 10: Frontend Layout Component

**Files:**
- Create: `apps/web/src/components/Layout.tsx`

- [ ] **Step 1: Create Layout.tsx**

```tsx
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Activity, FileText, Gauge } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: Gauge },
  { to: "/relatorio", label: "Relatório", icon: FileText },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 w-56 border-r bg-card">
        <div className="flex items-center gap-2 px-6 py-4 border-b">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Transformer Monitor</span>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  location.pathname === item.to
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <main className="pl-56">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between px-6 py-3">
            <h1 className="text-lg font-semibold">
              {navItems.find((i) => i.to === location.pathname)?.label ?? "Dashboard"}
            </h1>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
```

---

### Task 11: Frontend Hooks

**Files:**
- Create: `apps/web/src/hooks/useWebSocket.ts`
- Create: `apps/web/src/hooks/useDashboard.ts`

- [ ] **Step 1: Create hooks/useWebSocket.ts**

```ts
import { useEffect, useRef, useCallback } from "react";

type MessageHandler = (data: Record<string, unknown>) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.hostname}:3001/ws`;
    const ws = new WebSocket(url);

    ws.onopen = () => console.log("WS conectado");
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        // ignora mensagens mal formatadas
      }
    };
    ws.onerror = () => console.error("WS erro");
    ws.onclose = () => console.log("WS desconectado");

    wsRef.current = ws;
    return () => ws.close();
  }, [onMessage]);

  return wsRef;
}
```

- [ ] **Step 2: Create hooks/useDashboard.ts**

```ts
import { useState, useCallback, useRef } from "react";
import type { LeituraMQTT } from "@transformer-monitor/shared";

const MAX_PONTOS = 150;

interface PontoGrafico {
  timestamp: number;
  valor: number;
}

export function useDashboard() {
  const [leituras, setLeituras] = useState<Record<string, PontoGrafico[]>>({});
  const [ultimosValores, setUltimosValores] = useState<Record<string, LeituraMQTT>>({});
  const leiturasRef = useRef(leituras);
  leiturasRef.current = leituras;

  const processarLeitura = useCallback((data: Record<string, unknown>) => {
    const { topico, valor, ts, unidade } = data as { topico: string; valor: number; ts: number; unidade: string };

    setUltimosValores((prev) => ({ ...prev, [topico]: { ts, valor, unidade } }));

    setLeituras((prev) => {
      const serie = [...(prev[topico] || []), { timestamp: ts * 1000, valor }];
      if (serie.length > MAX_PONTOS) serie.shift();
      return { ...prev, [topico]: serie };
    });
  }, []);

  return { leituras, ultimosValores, processarLeitura };
}
```

---

### Task 12: Frontend MetricCard + LedIndicator

**Files:**
- Create: `apps/web/src/components/MetricCard.tsx`
- Create: `apps/web/src/components/LedIndicator.tsx`

- [ ] **Step 1: Create LedIndicator.tsx**

```tsx
import { cn } from "@/lib/utils";

type Props = {
  severity: "ok" | "aviso" | "critico";
};

const cores = {
  ok: "bg-green-500 shadow-green-500/50",
  aviso: "bg-yellow-500 shadow-yellow-500/50",
  critico: "bg-red-500 shadow-red-500/50",
};

export default function LedIndicator({ severity }: Props) {
  return (
    <span
      className={cn(
        "inline-block h-3 w-3 rounded-full shadow-lg animate-pulse",
        cores[severity]
      )}
    />
  );
}
```

- [ ] **Step 2: Create MetricCard.tsx**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import LedIndicator from "./LedIndicator";
import { avaliarSeveridade, mapearGrandeza } from "@transformer-monitor/shared";
import type { LeituraMQTT } from "@transformer-monitor/shared";

type Props = {
  titulo: string;
  topico: string;
  leitura: LeituraMQTT | null;
};

export default function MetricCard({ titulo, topico, leitura }: Props) {
  const grandeza = mapearGrandeza(topico);
  const sev = grandeza && leitura ? avaliarSeveridade(grandeza, leitura.valor) : "ok";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{titulo}</span>
          <LedIndicator severity={sev} />
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold">
            {leitura ? leitura.valor.toFixed(1) : "---"}
          </span>
          <span className="ml-1 text-sm text-muted-foreground">
            {leitura?.unidade ?? ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

### Task 13: Frontend Chart Component

**Files:**
- Create: `apps/web/src/components/Chart.tsx`

- [ ] **Step 1: Create Chart.tsx**

```tsx
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
  // Merge todos os pontos em um array único por timestamp
  const timestamps = [
    ...new Set(series.flatMap((s) => s.pontos.map((p) => p.timestamp))),
  ].sort();

  const dados = timestamps.map((ts) => {
    const ponto: Record<string, number | string> = { timestamp: ts };
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
```

---

### Task 14: Frontend AlertsPanel

**Files:**
- Create: `apps/web/src/components/AlertsPanel.tsx`

- [ ] **Step 1: Create AlertsPanel.tsx**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import type { AlarmeMQTT } from "@transformer-monitor/shared";
import { avaliarSeveridade, mapearGrandeza, LIMITES } from "@transformer-monitor/shared";
import type { LeituraMQTT } from "@transformer-monitor/shared";

type Props = {
  ultimosValores: Record<string, LeituraMQTT>;
};

const MENSAGENS: Record<string, string> = {
  temperatura: "Temperatura do núcleo elevada. Risco de degradação da isolação.",
  deltaT: "Gradiente térmico elevado para a carga atual. Possível curto parcial entre espiras.",
  vibracao120hz: "Vibração em 120Hz fora do padrão. Realizar aperto mecânico das chapas do núcleo.",
  correntePrimario: "Corrente primária acima do esperado. Verificar carga e condições da rede.",
};

export default function AlertsPanel({ ultimosValores }: Props) {
  const alertas: { grandeza: string; sev: "aviso" | "critico"; mensagem: string }[] = [];

  for (const [topico, leitura] of Object.entries(ultimosValores)) {
    const grandeza = mapearGrandeza(topico);
    if (!grandeza) continue;
    const sev = avaliarSeveridade(grandeza, leitura.valor);
    if (sev === "ok") continue;
    const lim = LIMITES[grandeza];
    const base = MENSAGENS[grandeza] ?? `Alerta: ${grandeza} = ${leitura.valor}`;
    const complemento = sev === "critico"
      ? ` Valor crítico: ${leitura.valor}${leitura.unidade} (limite: ${lim.critico}${leitura.unidade})`
      : ` Valor: ${leitura.valor}${leitura.unidade} (limite: ${lim.aviso}${leitura.unidade})`;
    alertas.push({ grandeza, sev, mensagem: base + complemento });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Alertas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alertas.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Todos os parâmetros normais
          </div>
        ) : (
          <div className="space-y-2">
            {alertas.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {a.sev === "critico" ? (
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                )}
                <div>
                  <Badge
                    variant={a.sev === "critico" ? "destructive" : "secondary"}
                    className="mr-1"
                  >
                    {a.sev.toUpperCase()}
                  </Badge>
                  {a.mensagem}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

### Task 15: Frontend Dashboard Page

**Files:**
- Create: `apps/web/src/pages/Dashboard.tsx`

- [ ] **Step 1: Create pages/Dashboard.tsx**

```tsx
import { useWebSocket } from "@/hooks/useWebSocket";
import { useDashboard } from "@/hooks/useDashboard";
import MetricCard from "@/components/MetricCard";
import Chart from "@/components/Chart";
import AlertsPanel from "@/components/AlertsPanel";
import { TOPICOS_MQTT } from "@transformer-monitor/shared";

export default function Dashboard() {
  const { leituras, ultimosValores, processarLeitura } = useDashboard();
  useWebSocket(processarLeitura);

  const metricas = [
    { titulo: "Temperatura", topico: TOPICOS_MQTT.temperaturaNucleo },
    { titulo: "ΔT", topico: TOPICOS_MQTT.deltaT },
    { titulo: "Corrente P", topico: TOPICOS_MQTT.correntePrimario },
    { titulo: "Corrente S", topico: TOPICOS_MQTT.correnteSecundario },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {metricas.map((m) => (
          <MetricCard
            key={m.topico}
            titulo={m.titulo}
            topico={m.topico}
            leitura={ultimosValores[m.topico] ?? null}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Chart
          titulo="Temperatura (°C)"
          series={[
            {
              dataKey: "temp",
              nome: "Núcleo",
              cor: "#ef4444",
              pontos: leituras[TOPICOS_MQTT.temperaturaNucleo] ?? [],
            },
          ]}
        />
        <Chart
          titulo="Correntes (A)"
          series={[
            {
              dataKey: "primario",
              nome: "Primário",
              cor: "#3b82f6",
              pontos: leituras[TOPICOS_MQTT.correntePrimario] ?? [],
            },
            {
              dataKey: "secundario",
              nome: "Secundário",
              cor: "#10b981",
              pontos: leituras[TOPICOS_MQTT.correnteSecundario] ?? [],
            },
          ]}
        />
        <Chart
          titulo="Vibração (g)"
          series={[
            {
              dataKey: "v120",
              nome: "120Hz",
              cor: "#f59e0b",
              pontos: leituras[TOPICOS_MQTT.vibracao120hz] ?? [],
            },
            {
              dataKey: "v240",
              nome: "240Hz",
              cor: "#8b5cf6",
              pontos: leituras[TOPICOS_MQTT.vibracao240hz] ?? [],
            },
          ]}
        />
      </div>

      <AlertsPanel ultimosValores={ultimosValores} />
    </div>
  );
}
```

---

### Task 16: Frontend Relatorio Page

**Files:**
- Create: `apps/web/src/pages/Relatorio.tsx`

- [ ] **Step 1: Create pages/Relatorio.tsx**

```tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";

export default function Relatorio() {
  const [loading, setLoading] = useState(false);

  const gerarPDF = async () => {
    setLoading(true);
    try {
      const fim = new Date();
      const inicio = new Date(fim.getTime() - 24 * 60 * 60 * 1000);

      const res = await fetch("/api/relatorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Falha ao gerar PDF");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "relatorio-transformador.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar relatório");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-lg mx-auto mt-12">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileDown className="h-5 w-5" />
          Exportar Relatório PDF
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gere um relatório de diagnóstico com as médias das últimas 24 horas,
          alertas disparados e recomendações técnicas.
        </p>
        <Button onClick={gerarPDF} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <FileDown className="mr-2 h-4 w-4" />
              Gerar PDF
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

### Task 17: Root Scripts and Final Integration

**Files:**
- Modify: `root package.json` (add scripts)

- [ ] **Step 1: Update root package.json scripts**

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "start": "node apps/server/dist/main.js",
    "dev:server": "npm run dev -w @transformer-monitor/server",
    "dev:web": "npm run dev -w @transformer-monitor/web",
    "lint": "turbo lint"
  }
}
```

- [ ] **Step 2: Install all dependencies and build**

Run: `npm install && npm run build`

- [ ] **Step 3: Verify build completes without errors**

Run: `npm run build` — deve compilar shared → server → web sem erros.

---

### Self-Review Checklist

1. **Spec coverage:** Tasks 1-2 → shared package (types, constants, limites). Tasks 3-8 → server (MQTT, WS, API, PDF). Tasks 9-16 → frontend (Dashboard, gráficos, alertas, relatório). Todos os requisitos do spec cobertos.
2. **Placeholders:** Nenhum "TBD", "TODO" ou código incompleto.
3. **Type consistency:** Todos os tipos referenciados entre tasks usam `@transformer-monitor/shared`. Nomes de funções e interfaces consistentes.
4. **Scope:** Focado exclusivamente em P5+P6 — sem firmware, sem hardware, sem MQTT broker setup.
