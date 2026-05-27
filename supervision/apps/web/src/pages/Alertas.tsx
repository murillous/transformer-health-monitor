import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from "@/components/ui/pagination";
import { History, Download, CheckCircle2, RotateCcw, CalendarIcon } from "lucide-react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  "transformador/nucleo/temperatura": "Temperatura do Núcleo",
  "transformador/nucleo/delta_t": "ΔT (Gradiente Térmico)",
  "transformador/vibracao/fft_120hz": "Vibração 120Hz",
  "transformador/primario/corrente": "Corrente Primário",
  "transformador/secundario/corrente": "Corrente Secundário",
  "transformador/vibracao/fft_240hz": "Vibração 240Hz",
};

interface AlarmeRow {
  ts: number;
  tipo: string;
  sev: "aviso" | "critico";
  valor: number;
  limite: number;
}

interface Paginacao {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type Formato = "csv" | "xlsx";
type FiltroSev = "" | "aviso" | "critico";
type FiltroPeriodo = "" | "1h" | "6h" | "hoje" | "7d" | "30d" | "customizado";

function periodoParams(periodo: FiltroPeriodo, customInicio?: Date, customFim?: Date): { inicio?: string; fim?: string } {
  const fim = customFim ?? new Date();
  if (!periodo) return {};
  if (periodo === "customizado") {
    if (!customInicio) return {};
    return { inicio: customInicio.toISOString(), fim: fim.toISOString() };
  }
  let inicio: Date;
  switch (periodo) {
    case "1h": inicio = new Date(fim.getTime() - 3600000); break;
    case "6h": inicio = new Date(fim.getTime() - 6 * 3600000); break;
    case "hoje": inicio = new Date(); inicio.setHours(0, 0, 0, 0); break;
    case "7d": inicio = new Date(fim.getTime() - 7 * 86400000); break;
    case "30d": inicio = new Date(fim.getTime() - 30 * 86400000); break;
    default: return {};
  }
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

function labelPeriodo(p: FiltroPeriodo): string {
  switch (p) {
    case "1h": return "Última hora";
    case "6h": return "Últimas 6 horas";
    case "hoje": return "Hoje";
    case "7d": return "Últimos 7 dias";
    case "30d": return "Últimos 30 dias";
    case "customizado": return "Customizado";
    default: return "Todo período";
  }
}

export default function Alertas() {
  const [dados, setDados] = useState<AlarmeRow[]>([]);
  const [pag, setPag] = useState<Paginacao>({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [formato, setFormato] = useState<Formato>("csv");
  const [filtroSev, setFiltroSev] = useState<FiltroSev>("");
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("");
  const [limitePag, setLimitePag] = useState(20);
  const [filtroStatus, setFiltroStatus] = useState<"todas" | "ativo" | "resolvido">("todas");
  const [customInicio, setCustomInicio] = useState<Date | undefined>();
  const [customFim, setCustomFim] = useState<Date | undefined>();

  const filtroStatusFn = (row: AlarmeRow): boolean => {
    if (filtroStatus === "todas") return true;
    const limite = Date.now() / 1000 - 3600;
    return filtroStatus === "ativo" ? row.ts >= limite : row.ts < limite;
  };

  const carregar = useCallback(async (page: number, sev: FiltroSev, periodo: FiltroPeriodo, limit: number, cInicio?: Date, cFim?: Date) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (sev) params.set("severidade", sev);
      const p = periodoParams(periodo, cInicio, cFim);
      if (p.inicio) params.set("inicio", p.inicio);
      if (p.fim) params.set("fim", p.fim);

      const res = await fetch(`/api/historico/alarmes?${params}`);
      const json = await res.json();
      setDados(json.data ?? []);
      setPag({ total: json.total, page: json.page, limit: json.limit, totalPages: json.totalPages });
    } catch {
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar(1, filtroSev, filtroPeriodo, limitePag, customInicio, customFim);
  }, [carregar, filtroSev, filtroPeriodo, limitePag, customInicio, customFim]);

  const mudarPagina = (p: number) => carregar(p, filtroSev, filtroPeriodo, limitePag, customInicio, customFim);

  const handleExport = () => {
    const nome = `alertas-transformador-${new Date().toISOString().slice(0, 10)}`;
    if (dados.length === 0) return;
    const linhas = dados.map((a) => ({
      Severidade: a.sev === "critico" ? "CRÍTICO" : "AVISO",
      Grandeza: LABELS[a.tipo] ?? a.tipo,
      "Valor": `${a.valor}`,
      Limiar: `${a.limite}`,
      Disparo: new Date(a.ts * 1000).toLocaleString("pt-BR"),
    }));
    if (formato === "csv") {
      const cab = Object.keys(linhas[0]) as (keyof typeof linhas[0])[];
      const csv = [cab.join(";"), ...linhas.map((l) => cab.map((c) => l[c]).join(";"))].join("\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${nome}.csv`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.json_to_sheet(linhas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Alertas");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${nome}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const paginas = () => {
    const items: React.ReactNode[] = [];
    const { page, totalPages } = pag;
    if (totalPages <= 1) return items;

    items.push(
      <PaginationItem key="prev">
        <PaginationPrevious disabled={page <= 1} onClick={() => mudarPagina(page - 1)} />
      </PaginationItem>
    );

    const maxVisiveis = 7;
    let inicio = Math.max(1, page - Math.floor(maxVisiveis / 2));
    let fim = Math.min(totalPages, inicio + maxVisiveis - 1);
    if (fim - inicio + 1 < maxVisiveis) {
      inicio = Math.max(1, fim - maxVisiveis + 1);
    }

    if (inicio > 1) {
      items.push(
        <PaginationItem key={1}>
          <PaginationLink onClick={() => mudarPagina(1)}>1</PaginationLink>
        </PaginationItem>
      );
      if (inicio > 2) items.push(<PaginationItem key="start-ellipsis"><PaginationEllipsis /></PaginationItem>);
    }

    for (let i = inicio; i <= fim; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink isActive={i === page} onClick={() => mudarPagina(i)}>{i}</PaginationLink>
        </PaginationItem>
      );
    }

    if (fim < totalPages) {
      if (fim < totalPages - 1) items.push(<PaginationItem key="end-ellipsis"><PaginationEllipsis /></PaginationItem>);
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => mudarPagina(totalPages)}>{totalPages}</PaginationLink>
        </PaginationItem>
      );
    }

    items.push(
      <PaginationItem key="next">
        <PaginationNext disabled={page >= totalPages} onClick={() => mudarPagina(page + 1)} />
      </PaginationItem>
    );

    return items;
  };

  return (
    <Card className="ring-0 shadow-sm border-0">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          Histórico de Alertas
          {pag.total > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({pag.total} registros)</span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {dados.length > 0 && (
            <>
              <Select value={formato} onValueChange={(v) => setFormato(v as Formato)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">XLSX</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Exportar
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => carregar(1, filtroSev, filtroPeriodo, limitePag, customInicio, customFim)}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
          <div className="flex items-end gap-4 mb-4 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Estado</span>
              <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as "todas" | "ativo" | "resolvido")}>
                <SelectTrigger className="w-36">
                  <SelectValue>
                    {filtroStatus === "ativo" ? "Ativo" : filtroStatus === "resolvido" ? "Resolvido" : "Todos"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todos</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="resolvido">Resolvido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Severidade</span>
              <Select value={filtroSev} onValueChange={(v) => setFiltroSev(v as FiltroSev)}>
                <SelectTrigger className="w-36">
                  <SelectValue>
                    {filtroSev === "critico" ? "Crítico" : filtroSev === "aviso" ? "Aviso" : "Todas"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  <SelectItem value="critico">Crítico</SelectItem>
                  <SelectItem value="aviso">Aviso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Período</span>
              <Select value={filtroPeriodo} onValueChange={(v) => setFiltroPeriodo(v as FiltroPeriodo)}>
                <SelectTrigger className="w-40">
                  <SelectValue>{labelPeriodo(filtroPeriodo)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todo período</SelectItem>
                  <SelectItem value="1h">Última hora</SelectItem>
                  <SelectItem value="6h">Últimas 6 horas</SelectItem>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="customizado">Customizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filtroPeriodo === "customizado" && (
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Início</span>
                  <Popover>
                    <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-44 justify-start gap-2 font-normal")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {customInicio ? format(customInicio, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "Selecionar"}
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0 gap-0" sideOffset={4}>
                      <Calendar
                        mode="single"
                        selected={customInicio}
                        onSelect={(d) => {
                          if (d) {
                            const atual = customInicio ?? new Date();
                            d.setHours(atual.getHours(), atual.getMinutes());
                            setCustomInicio(d);
                          }
                        }}
                        className="[--cell-size:--spacing(10)] w-full"
                      />
                      <div className="flex items-center gap-2 border-t border-border px-3 py-2 bg-background">
                        <span className="text-xs text-muted-foreground">Hora:</span>
                        <input
                          type="time"
                          value={customInicio ? format(customInicio, "HH:mm") : "00:00"}
                          onChange={(e) => {
                            const [h, m] = e.target.value.split(":").map(Number);
                            const d = customInicio ?? new Date();
                            d.setHours(h, m, 0, 0);
                            setCustomInicio(new Date(d));
                          }}
                          className="h-7 border-0 rounded-none bg-transparent px-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Fim</span>
                  <Popover>
                    <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-44 justify-start gap-2 font-normal")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {customFim ? format(customFim, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "Selecionar"}
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0 gap-0" sideOffset={4}>
                      <Calendar
                        mode="single"
                        selected={customFim}
                        onSelect={(d) => {
                          if (d) {
                            const atual = customFim ?? new Date();
                            d.setHours(atual.getHours(), atual.getMinutes());
                            setCustomFim(d);
                          }
                        }}
                        className="[--cell-size:--spacing(10)] w-full"
                      />
                      <div className="flex items-center gap-2 border-t border-border px-3 py-2 bg-background">
                        <span className="text-xs text-muted-foreground">Hora:</span>
                        <input
                          type="time"
                          value={customFim ? format(customFim, "HH:mm") : "23:59"}
                          onChange={(e) => {
                            const [h, m] = e.target.value.split(":").map(Number);
                            const d = customFim ?? new Date();
                            d.setHours(h, m, 0, 0);
                            setCustomFim(new Date(d));
                          }}
                          className="h-7 border-0 rounded-none bg-transparent px-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !dados || dados.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Nenhum alerta encontrado.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Grandeza</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Limiar</TableHead>
                    <TableHead>Disparo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.filter(filtroStatusFn).map((a, i) => (
                    <TableRow key={`${a.ts}-${a.tipo}-${i}`}>
                      <TableCell>
                        <Badge variant={a.sev === "critico" ? "destructive" : "secondary"}>
                          {a.sev === "critico" ? "CRÍTICO" : "AVISO"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{LABELS[a.tipo] ?? a.tipo}</TableCell>
                      <TableCell>{a.valor}</TableCell>
                      <TableCell className="text-muted-foreground">{a.limite}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(a.ts * 1000).toLocaleString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Por página:</span>
                <Select value={String(limitePag)} onValueChange={(v) => { setLimitePag(Number(v)); }}>
                  <SelectTrigger className="w-16 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>

                <Pagination className="w-auto">
                  <PaginationContent className="gap-0.5">
                    {paginas()}
                  </PaginationContent>
                </Pagination>

                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {pag.total > 0
                    ? `${(pag.page - 1) * pag.limit + 1}-${Math.min(pag.page * pag.limit, pag.total)} de ${pag.total}`
                    : "0 registros"}
                </span>
              </div>
            </>
          )}
      </CardContent>
    </Card>
  );
}
