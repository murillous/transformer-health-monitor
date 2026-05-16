# Transformer Health Monitor — Software de Supervisão

## Stack

| Layer      | Tecnologia                              |
| ---------- | --------------------------------------- |
| Backend    | Express + TypeScript                    |
| Frontend   | React + Vite + Shadcn + Tailwind        |
| Gráficos   | Recharts                                |
| Tempo real | WebSocket (`ws`)                        |
| MQTT       | `mqtt.js`                               |
| PDF        | Puppeteer (HTML → PDF)                  |
| Validação  | Zod (shared package)                    |
| Organização| Turborepo                               |
| Preset     | Shadcn `b2DLVcgnT`                      |

## Arquitetura

```ascii
Mosquitto Broker (:1883)
      │
      │ [MQTT - JSON]
      ▼
┌──────────────────────────────────────┐
│  Express Server (:3001)              │
│                                      │
│  mqtt/subscriber.ts                  │
│    ├─ conecta no broker              │
│    ├─ valida payload com zod         │
│    ├─ persiste no DataStore          │
│    └─ emite evento                  │
│                                      │
│  ws/hub.ts                           │
│    ├─ mantém clientes WS            │
│    └─ broadcast ao receber evento   │
│                                      │
│  api/                                │
│    ├─ GET  /api/historico           │
│    └─ POST /api/relatorio (PDF)      │
│                                      │
│  Serve /dist (produção)             │
└──────────────────────────────────────┘
      │
      │ [WebSocket]
      ▼
┌──────────────────────────────────────┐
│  React + Vite + Shadcn              │
│                                      │
│  useWebSocket() → estado global      │
│  Dashboard (tempo real)              │
│  Página de Relatório (PDF export)    │
└──────────────────────────────────────┘
```

**Princípio:** O Express é o único ponto de contato com o MQTT. O React nunca toca no broker — tudo passa pelo servidor via WebSocket.

## Estrutura de Diretórios

```
transformer-monitor/
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── mqtt/
│   │       │   └── subscriber.ts    # conecta broker, valida, emite
│   │       ├── ws/
│   │       │   └── hub.ts           # broadcast WS pra todos clients
│   │       ├── api/
│   │       │   ├── historico.ts     # GET /api/historico
│   │       │   └── relatorio.ts     # POST /api/relatorio (PDF)
│   │       ├── db/
│   │       │   └── store.ts         # DataStore (memória + CSV)
│   │       └── main.ts              # entry point: Express + WS + serve
│   └── web/
│       └── src/
│           ├── pages/
│           │   ├── Dashboard.tsx
│           │   └── Relatorio.tsx
│           ├── components/
│           │   ├── Layout.tsx
│           │   ├── MetricCard.tsx
│           │   ├── Chart.tsx
│           │   ├── AlertsPanel.tsx
│           │   ├── LedIndicator.tsx
│           │   └── ui/ (shadcn)
│           ├── hooks/
│           │   ├── useWebSocket.ts
│           │   └── useDashboard.ts
│           ├── lib/
│           │   └── api.ts  (fetch /api/*)
│           └── App.tsx
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types.ts     # LeituraMQTT, AlarmeMQTT, schemas zod
│       │   └── constants.ts # tópicos MQTT, limites de alerta
│       └── package.json
├── package.json (workspaces + turbo)
└── turbo.json

## Componentes do Sistema

### 1. MQTT Subscriber (`server/src/mqtt/subscriber.ts`)

- Conecta no broker Mosquitto (`localhost:1883`)
- Escuta todos os tópicos definidos em `shared/constants.ts`
- Valida payload com Zod (`leituraSchema`)
- Caso inválido: loga erro e descarta
- Caso válido: persiste no DataStore + emite evento `"nova-leitura"`

### 2. WebSocket Hub (`server/src/ws/hub.ts`)

- Mantém lista de clientes conectados
- Escuta evento `"nova-leitura"` do subscriber
- Broadcast para todos os clientes conectados
- Cliente recebe `{ topico, ts, valor, unidade }`

### 3. DataStore (`server/src/db/store.ts`)

- **Memória:** array circular com `MAX_REGISTROS` (10000)
- **CSV:** `historico_YYYY-MM-DD.csv` com rotação diária
- Métodos: `push(registro)`, `historico()`, `registrosPorPeriodo(inicio, fim)`

### 4. REST API (`server/src/api/`)

| Rota                    | Método | Descrição                          |
| ----------------------- | ------ | ---------------------------------- |
| `GET /api/historico`    | GET    | Retorna registros (query: inicio, fim, topico) |
| `POST /api/relatorio`   | POST   | Gera PDF via Puppeteer e retorna   |

### 5. Dashboard (`web/src/pages/Dashboard.tsx`)

**Layout:**
- Sidebar com navegação (Shadcn)
- Header com nome do projeto + botão "Relatório em PDF"

**Métricas (4 MetricCards no topo):**
- Temperatura núcleo (°C) + LED
- Gradiente térmico ΔT (°C) + LED
- Corrente primário (A) + LED
- Corrente secundário (A) + LED

**Gráficos (Recharts LineChart com janela deslizante):**
- Temperatura (últimos 5 min)
- Correntes primário/secundário (sobrepostas)
- Vibração 120Hz e 240Hz (sobrepostas)

**Painel de Alertas:**
- Lista de alarmes ativos com severidade (aviso/crítico)
- Ícone: 🟢 verde, 🟡 amarelo, 🔴 vermelho

### 6. Relatório PDF (`web/src/pages/Relatorio.tsx`)

- Botão "Gerar PDF" → POST `/api/relatorio` com parâmetros (início, fim)
- Server monta HTML com dados, converte com Puppeteer, retorna buffer
- Frontend faz download do PDF

**Template HTML do relatório:**
- Cabeçalho: "Relatório de Diagnóstico — Transformer Health Monitor"
- Data/Hora de geração
- Período analisado
- Tabela de médias por grandeza no período
- Alertas disparados (data, severidade, mensagem)
- Diagnóstico textual baseado nos limites
- Rodapé com timestamp

### 7. Lógica de Limites e Alertas (`shared/constants.ts`)

```ts
export const LIMITES = {
  temperatura:  { aviso: 70, critico: 85 },
  deltaT:       { aviso: 15, critico: 25 },
  vibracao120hz:{ aviso: 0.20, critico: 0.45 },
  correnteP:    { aviso: 4.0, critico: 6.0 },
} as const;
```

Os limites são definidos em `shared/constants.ts` e usados tanto no **front** (cor do LED, painel de alertas) quanto no **server** (diagnóstico textual do PDF). A lógica de avaliação (comparar valor vs limite → "ok" / "aviso" / "critico") fica em uma função utilitária compartilhada.

## Design da branch

- Nome: `feat/supervision-software`
- Base: `main`
- Commits planejados:
  1. Setup do workspace Turborepo + pacotes
  2. Shared package (types, constants, zod)
  3. Server: MQTT subscriber + WebSocket hub + store
  4. Server: API de histórico + relatório PDF
  5. Front: setup Vite + Shadcn + Layout
  6. Front: Dashboard com gráficos + alertas
  7. Front: Página de Relatório
  8. Integração e ajustes finos

## Próximos passos

Após aprovação deste design, o plano detalhado de implementação será criado via `writing-plans` skill.

## Decisões de Design

- **Monolito em produção:** Express serve o front buildado + API + WS na mesma porta
- **Dev separado:** Vite (:5173) com proxy para Express (:3001)
- **Sem MQTT no front:** Segurança e simplicidade — browser não precisa de cliente MQTT
- **CSV + memória:** Sem banco de dados — suficiente pra escopo acadêmico
- **Puppeteer p/ PDF:** Template HTML permite estilo flexível sem aprender nova DSL
- **Validação com Zod:** Garante que dados mal formatados não quebram o sistema
