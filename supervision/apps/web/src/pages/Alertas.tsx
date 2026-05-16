import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from "@/components/ui/pagination";
import { History, Download, CheckCircle2, RotateCcw } from "lucide-react";
import * as XLSX from "xlsx";

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
type FiltroPeriodo = "" | "1h" | "6h" | "hoje" | "7d" | "30d";

function periodoParams(periodo: FiltroPeriodo): { inicio?: string; fim?: string } {
  const fim = new Date();
  if (!periodo) return {};
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

export default function Alertas() {
  const [dados, setDados] = useState<AlarmeRow[]>([]);
  const [pag, setPag] = useState<Paginacao>({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [formato, setFormato] = useState<Formato>("csv");
  const [filtroSev, setFiltroSev] = useState<FiltroSev>("");
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("");

  const LIMIT = 20;

  const carregar = useCallback(async (page: number, sev: FiltroSev, periodo: FiltroPeriodo) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (sev) params.set("severidade", sev);
      const p = periodoParams(periodo);
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
    carregar(1, filtroSev, filtroPeriodo);
  }, [carregar, filtroSev, filtroPeriodo]);

  const mudarPagina = (p: number) => carregar(p, filtroSev, filtroPeriodo);

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
          <Button variant="ghost" size="sm" onClick={() => carregar(1, filtroSev, filtroPeriodo)}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-4 mb-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Severidade</span>
            <Select value={filtroSev} onValueChange={(v) => setFiltroSev(v as FiltroSev)}>
              <SelectTrigger className="w-40">
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
              <SelectTrigger className="w-44">
                <SelectValue>
                  {filtroPeriodo === "1h" ? "Última hora" : filtroPeriodo === "6h" ? "Últimas 6 horas" : filtroPeriodo === "hoje" ? "Hoje" : filtroPeriodo === "7d" ? "Últimos 7 dias" : filtroPeriodo === "30d" ? "Últimos 30 dias" : "Todo período"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todo período</SelectItem>
                <SelectItem value="1h">Última hora</SelectItem>
                <SelectItem value="6h">Últimas 6 horas</SelectItem>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : dados.length === 0 ? (
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
                {dados.map((a, i) => (
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

            {pag.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Página {pag.page} de {pag.totalPages} ({pag.total} alertas)
                </span>
                <Pagination>
                  <PaginationContent>
                    {paginas()}
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
