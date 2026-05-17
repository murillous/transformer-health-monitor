# Transformer Health Monitor — Sistema de Supervisão

Sistema de monitoramento contínuo de transformadores de potência com sensores embarcados, dashboard web em tempo real e geração de relatórios.

## Arquitetura

```
supervision/
├── apps/intelligence/    # Módulo de Inteligência (Python)
│   ├── fuzzy_engine.py   # Motor de inferência fuzzy (Mamdani + centróide)
│   ├── main.py           # Sistema fuzzy para diagnóstico de transformadores
│   └── requirements.txt
├── apps/server/          # Backend TypeScript/Express
│   └── src/
│       ├── api/          # Rotas HTTP
│       │   ├── historico.ts   # GET /api/historico, GET /api/historico/alarmes
│       │   ├── relatorio.ts   # POST /api/relatorio (PDF)
│       │   ├── simular.ts     # POST /api/simular/iniciar, /parar
│       │   └── diagnostico.ts # POST /api/diagnostico (chama Python)
│       ├── db/           # Persistência
│       │   ├── database.ts    # SQLite schema + CRUD + consulta paginada
│       │   └── store.ts       # Interface delegando para database.ts
│       ├── mqtt/         # Conexão com sensor MQTT
│       ├── ws/           # WebSocket para broadcast em tempo real
│       └── main.ts       # Entrypoint Express
└── apps/web/             # Frontend React + Vite
    └── src/
        ├── components/   # UI (shadcn/ui + base-ui)
        │   └── DiagnosticoPanel.tsx  # Painel de diagnóstico inteligente
        ├── hooks/
        │   └── useDashboard.ts  # Estado global, EMA smoothing, merge WS
        └── pages/
            ├── Dashboard.tsx    # Gráficos em tempo real + diagnóstico
            ├── Alertas.tsx      # Histórico de alarmes com filtros
            └── Relatorio.tsx    # Geração de PDF
```

## Pré-requisitos

```bash
# Python 3 com numpy
pip install -r apps/intelligence/requirements.txt
```

## Como Rodar

```bash
# Desenvolvimento (servidor + web simultaneamente)
npm run dev

# Ou individualmente:
npm run dev:server   # Servidor :3001
npm run dev:web      # Frontend :5173
```

O servidor reinicia automaticamente em alterações (tsx watch).

## Componentes

### Dashboard (`/`)
- Gráficos em tempo real de temperatura, correntes e espectro FFT
- Dados via WebSocket (ao vivo) + histórico da API (ao montar)
- Suavização EMA (alpha=0.35) no espectro FFT

### Alertas
- Tabela de alarmes com 3 filtros: Estado (ativo/resolvido), Severidade (crítico/aviso), Período
- Paginação com shadcn (page size 10/20/50)
- Exportação CSV/XLSX
- Filtro Estado aplicado client-side: ativo = timestamp nos últimos 3600s

### Diagnóstico Inteligente
- Motor de inferência fuzzy (Mamdani) implementado em Python com NumPy
- 6 variáveis de entrada: temperatura, ΔT, vibração 120Hz, vibração 240Hz, corrente primária e secundária
- 17 regras fuzzy cobrindo falhas térmicas, mecânicas, elétricas e harmônicas
- Gera sugestões de intervenção técnica com severidade e recomendação
- Risco operacional e urgência de intervenção por defuzzificação por centróide
- Executado automaticamente a cada ciclo de aquisição, resultado broadcast via WebSocket
- Painel visual no Dashboard com barra de risco, LED de severidade e lista de intervenções

### Relatório
- Gera PDF pelo servidor com Puppeteer
- Inclui SVGs inline de temperatura, correntes, vibração e espectro FFT
- Diagnóstico automático baseado nos dados

## API

| Rota | Descrição |
|------|-----------|
| `GET /api/historico` | Dados históricos de sensores |
| `GET /api/historico/alarmes?page=&limit=&severidade=&inicio=&fim=` | Alarmes paginados |
| `POST /api/simular/iniciar` | Inicia simulação de dados |
| `POST /api/simular/parar` | Para simulação |
| `POST /api/diagnostico` | Diagnóstico fuzzy das últimas leituras |
| `GET /api/relatorio` | Gera PDF de relatório |
| `WS /ws` | WebSocket com dados em tempo real + diagnóstico |

## Persistência

SQLite em `data/monitor.db` com WAL mode. Índices por timestamp, severidade e grandeza. A store em memória foi substituída pelo SQLite para persistência entre restarts.

## Stack

- **Backend:** TypeScript, Express, better-sqlite3, Puppeteer, ws
- **Frontend:** React, Vite, Recharts, shadcn/ui, base-ui
- **Inteligência:** Python 3, NumPy (inferência fuzzy Mamdani)
- **Comunicação:** WebSocket (tempo real), REST API (histórico)
