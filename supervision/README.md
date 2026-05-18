# supervision/

Monorepo TypeScript + Python da stack de supervisão.

A documentação completa (arquitetura, API, WebSocket, diagnóstico fuzzy) está em **[`../docs/06-supervision.md`](../docs/06-supervision.md)**.

## Quick start

```bash
npm install
pip install -r apps/intelligence/requirements.txt
npm run dev
```

## Features

### Dashboard em Tempo Real

- **Métricas**: temperatura do núcleo, ΔT, corrente primário/secundário (cards com `border-l-4` colorido por severidade)
- **Gráficos de tendência**: temperatura, correntes, vibração (120Hz/240Hz), rendimento
- **Espectro FFT**: 10 bins (60-600Hz), suavização EMA (α=0.35), linhas de referência em 120Hz e 240Hz
- **Formas de onda**: corrente primário + secundário, atualizadas a 200ms com ruído ciclo-a-ciclo
- **Resumo diagnóstico + alertas**: cards no topo com navegação rápida para as respectivas tabs
- **Tema**: alternador claro/escuro com persistência em localStorage (ícone lua/sol no header)

### Simulador de Sensores

Gera dados sintéticos realistas via POST `/api/simular/iniciar`:

| Grandeza | Base | Variação | Spike Prob | Spike Mag |
|----------|------|----------|-----------|-----------|
| Temperatura | 55°C | ±10°C | 5% | +20°C |
| ΔT | 8°C | ±4°C | 3% | +15°C |
| Corrente Primário | 2.8A | ±0.8A | 4% | +3A |
| Corrente Secundário | 22A | ±6A | 4% | +20A |
| Vibração 120Hz | 0.08g | ±0.06g | 6% | +0.4g |
| Vibração 240Hz | 0.04g | ±0.04g | 5% | +0.2g |

**Timings**:
- Trends (leituras, espectro, diagnóstico): **1000ms**
- Osciloscópio (formas de onda): **200ms** com ruído ±2% por amostra

### Alertas

- Notificações toast via sonner para alarmes críticos/aviso
- 3 filtros: Estado (ativo/resolvido), Severidade (crítico/aviso), Período (date picker)
- Paginação shadcn com page size 10/20/50
- Alarme ativo = última ocorrência nos últimos 3600s
- Persistência em SQLite + CSV

### Diagnóstico Inteligente

**Motor Fuzzy** (`apps/intelligence/`):
- 6 variáveis de entrada: temperatura, ΔT, vibração 120Hz/240Hz, corrente primário/secundário
- 2 variáveis avançadas: `correlacao_cv` (corrente × vibração), `vida_consumida` (Arrhenius)
- Defuzzificação por centróide (NumPy)
- 20+ regras Mamdani cobrindo falhas térmicas, mecânicas, elétricas, harmônicas e combinatórias
- Executado via subprocess do Express a cada ciclo de aquisição
- 16+ tipos de diagnóstico com severidade, mensagem e recomendação técnica

**Correlação Corrente × Vibração** — Detecta co-elevação de corrente primária e vibração 120Hz em janela de 20s. Quando ambos sobem simultaneamente, o fuzzy amplifica o risco e gera diagnóstico de estresse eletromecânico.

**Vida Residual (Arrhenius)** — Acumulador in-memory baseado na regra dos 10°C: cada +10°C acima de 80°C dobra a taxa de envelhecimento do isolamento. Exibe % consumido e taxa atual de envelhecimento.

**Tendência Preditiva** — Regressão linear nos últimos 30 pontos de temperatura e ΔT. Sempre visível no painel com setas direcionais (↑ estável ↓). Quando a inclinação é significativa (R² > 0.3) e o tempo estimado até o alarme é < 2h, exibe cards de predição com "alarme em ~Xmin".

**Análise de Harmônicas (FFT indireta)** — Relação vib240/vib120 computada como indicador de distorção harmônica por carga não-linear. Quando a relação ultrapassa 1.5, o fuzzy gera diagnóstico de distorção harmônica. Útil para detectar conexão de cargas não-lineares (fontes chaveadas, inversores).

**Thresholds Adaptativos (Z-Score)** — A cada ciclo, o servidor consulta os últimos 5 minutos de dados históricos no SQLite, calcula média e desvio padrão para cada grandeza. O Z-score (quantos σ acima/abaixo da média) é alimentado ao fuzzy como variável de entrada. Um Z-score > 3 dispara diagnóstico de anomalia adaptativa — detecta comportamentos anormais mesmo dentro dos limites absolutos.

**Meta-Diagnóstico Combinatório** — Duas regras que combinam 3+ variáveis simultaneamente: (1) temperatura alta + vibração 120Hz + corrente elevada → falha multifatorial térmico-mecânica. (2) gradiente térmico alto + corrente elevada + vibração 120Hz → falha térmico-elétrica. Risco ≥ que a soma dos riscos individuais.

**Taxa de Degradação (2ª Derivada)** — Além da inclinação (1ª derivada), a tendência agora mostra aceleração: divide o histórico ao meio e compara as inclinações de cada metade. Se a segunda metade sobe mais rápido, exibe ⚡acelerando — indicativo de degradação progressiva que exige intervenção antes que atinja o limite crítico.

### Relatório PDF

- Geração server-side com Puppeteer
- SVGs inline de temperatura, correntes, vibração, espectro FFT
- Cabeçalho com status geral (OK/Atenção/Crítico)
- Tabela de estatísticas (mín/méd/máx) por grandeza
- Diagnóstico automático na última seção

### Persistência

- **SQLite** (`data/monitor.db`): WAL mode, índices por timestamp/tópico/severidade
- **CSV** (`data/datalog_YYYY-MM-DD.csv` + `data/alarmes_YYYY-MM-DD.csv`): append contínuo, um arquivo por dia

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/simular/iniciar` | Inicia simulação |
| POST | `/api/simular/parar` | Para simulação |
| GET | `/api/historico?inicio=&fim=` | Dados históricos de sensores |
| GET | `/api/historico/alarmes?page=&limit=&severidade=&inicio=&fim=` | Alarmes paginados |
| POST | `/api/diagnostico` | Diagnóstico fuzzy das últimas leituras |
| GET | `/api/relatorio` | Gera PDF |
| WS | `/ws` | WebSocket (leituras + espectro + diagnóstico) |

### WebSocket — Tópicos Broadcast

| Tópico | Dados | Frequência |
|--------|-------|------------|
| `transformador/nucleo/temperatura` | `{topico, ts, valor, unidade}` | 1s |
| `transformador/nucleo/delta_t` | mesmo padrão | 1s |
| `transformador/primario/corrente` | mesmo padrão | 1s |
| `transformador/secundario/corrente` | mesmo padrão | 1s |
| `transformador/vibracao/fft_120hz` | mesmo padrão | 1s |
| `transformador/vibracao/fft_240hz` | mesmo padrão | 1s |
| `transformador/vibracao/espectro` | `{topico, ts, espectro: [{freq, amplitude}]}` | 1s |
| `onda_corrente_primario` | `{topico, ts, amostras: number[]}` | 200ms |
| `onda_corrente_secundario` | `{topico, ts, amostras: number[]}` | 200ms |
| `diagnostico` | resultado completo do fuzzy | 1s |
| `transformador/heartbeat` | `{topico, ts, valor: 1}` | 1s |

### Formato de Saída do Diagnóstico

```json
{
  "timestamp": 1715875200,
  "risco_operacional": { "score": 45.2, "nivel": "moderado", "termos": {...} },
  "urgencia_intervencao": { "score": 30.0, "nivel": "media" },
  "vida_residual": { "consumido": 3.2, "taxa_atual": 0.5 },
  "tendencias": [
    { "grandeza": "temperatura", "label": "Temperatura", "inclinacao": 0.15, "direcao": "subindo" }
  ],
  "predicoes": [
    { "grandeza": "temperatura", "label": "Temperatura", "valor_atual": 62, "tendencia": "subindo", "inclinacao": 0.5, "tempo_para_alarme": 46, "alarme_em": "critico" }
  ],
  "diagnosticos": [
    {
      "tipo": "temperatura_elevada",
      "severidade": "aviso",
      "titulo": "Temperatura Elevada",
      "mensagem": "...",
      "recomendacao": "...",
      "grandeza": "temperatura",
      "valor_atual": 62
    }
  ],
  "grandezas_criticas": ["temperatura"],
  "severidade_geral": "aviso"
}
```

## Stack

- **Backend:** TypeScript, Express, better-sqlite3, Puppeteer, ws
- **Frontend:** React 19, Vite, Recharts, shadcn/ui, base-ui, Tailwind CSS
- **Inteligência:** Python 3, NumPy (inferência fuzzy Mamdani)
- **Persistência:** SQLite (WAL) + CSV contínuo
- **Comunicação:** WebSocket (tempo real), REST API (histórico)
