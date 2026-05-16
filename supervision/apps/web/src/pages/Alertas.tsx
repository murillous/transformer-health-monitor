import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { History, Download, CheckCircle2 } from "lucide-react";
import type { AlertaHistorico } from "@/hooks/useDashboard";
import * as XLSX from "xlsx";

const LABELS: Record<string, string> = {
  temperatura: "Temperatura do Núcleo",
  deltaT: "ΔT (Gradiente Térmico)",
  vibracao120hz: "Vibração 120Hz",
  correntePrimario: "Corrente Primário",
  correnteSecundario: "Corrente Secundário",
  vibracao240hz: "Vibração 240Hz",
};

type Formato = "csv" | "xlsx";

type Props = {
  historico: AlertaHistorico[];
  onLimpar: () => void;
};

function formatar(ts: number): string {
  return new Date(ts * 1000).toLocaleString("pt-BR");
}

function linhasParaExport(dados: AlertaHistorico[]): Record<string, string>[] {
  return dados.map((a) => ({
    Severidade: a.sev === "critico" ? "CRÍTICO" : "AVISO",
    Grandeza: LABELS[a.grandeza] ?? a.grandeza,
    "Valor (atual)": `${a.valor}${a.unidade}`,
    Limiar: `${a.limite}${a.unidade}`,
    Disparo: formatar(a.timestamp),
    Resolução: a.status === "resolvido" && a.resolvedAt ? formatar(a.resolvedAt / 1000) : "-",
    Status: a.status === "ativo" ? "Ativo" : "Resolvido",
  }));
}

function exportarCSV(dados: AlertaHistorico[], nome: string) {
  const linhas = linhasParaExport(dados);
  if (linhas.length === 0) return;
  const cabecalhos = Object.keys(linhas[0]);
  const conteudo = [
    cabecalhos.join(";"),
    ...linhas.map((l) => cabecalhos.map((c) => l[c]).join(";")),
  ].join("\n");
  const blob = new Blob(["\ufeff" + conteudo], { type: "text/csv;charset=utf-8;" });
  download(blob, `${nome}.csv`);
}

function exportarXLSX(dados: AlertaHistorico[], nome: string) {
  const linhas = linhasParaExport(dados);
  if (linhas.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Alertas");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(new Blob([buf]), `${nome}.xlsx`);
}

function download(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

type FiltroStatus = "todos" | "ativo" | "resolvido";
type FiltroSev = "todas" | "aviso" | "critico";
type FiltroPeriodo = "todo" | "1h" | "6h" | "hoje" | "7d" | "30d";

function dentroPeriodo(ts: number, periodo: FiltroPeriodo): boolean {
  const agora = Date.now() / 1000;
  switch (periodo) {
    case "todo": return true;
    case "1h": return ts >= agora - 3600;
    case "6h": return ts >= agora - 6 * 3600;
    case "hoje": {
      const inicioHoje = new Date();
      inicioHoje.setHours(0, 0, 0, 0);
      return ts >= inicioHoje.getTime() / 1000;
    }
    case "7d": return ts >= agora - 7 * 86400;
    case "30d": return ts >= agora - 30 * 86400;
  }
}

export default function Alertas({ historico, onLimpar }: Props) {
  const [formato, setFormato] = useState<Formato>("csv");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [filtroSev, setFiltroSev] = useState<FiltroSev>("todas");
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("todo");

  const filtrados = historico.filter((a) => {
    if (filtroStatus !== "todos" && a.status !== filtroStatus) return false;
    if (filtroSev !== "todas" && a.sev !== filtroSev) return false;
    if (!dentroPeriodo(a.timestamp, filtroPeriodo)) return false;
    return true;
  });

  const ativos = historico.filter((a) => a.status === "ativo");

  const handleExport = () => {
    const exportar = filtrados.length > 0 ? filtrados : historico;
    const nome = `alertas-transformador-${new Date().toISOString().slice(0, 10)}`;
    if (formato === "csv") {
      exportarCSV(exportar, nome);
    } else {
      exportarXLSX(exportar, nome);
    }
  };

  return (
    <Card className="ring-0 shadow-sm border-0">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          Histórico de Alertas
          {ativos.length > 0 && (
            <Badge variant="destructive">{ativos.length} ativos</Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {historico.length > 0 && (
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
          <Button variant="ghost" size="sm" onClick={onLimpar}>
            Limpar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {historico.length > 0 && (
          <div className="flex items-end gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as FiltroStatus)}>
                <SelectTrigger className="w-36">
                  <SelectValue>
                    {filtroStatus === "ativo" ? "Ativos" : filtroStatus === "resolvido" ? "Resolvidos" : "Todos"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativo">Ativos</SelectItem>
                  <SelectItem value="resolvido">Resolvidos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Severidade</span>
              <Select value={filtroSev} onValueChange={(v) => setFiltroSev(v as FiltroSev)}>
                <SelectTrigger className="w-40">
                  <SelectValue>
                    {filtroSev === "critico" ? "Crítico" : filtroSev === "aviso" ? "Aviso" : "Todas"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
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
                  <SelectItem value="todo">Todo período</SelectItem>
                  <SelectItem value="1h">Última hora</SelectItem>
                  <SelectItem value="6h">Últimas 6 horas</SelectItem>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {filtrados.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            {historico.length === 0 ? (
              <><CheckCircle2 className="h-4 w-4 text-green-600" /> Nenhum alerta registrado.</>
            ) : (
              "Nenhum alerta com os filtros atuais."
            )}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Severidade</TableHead>
                <TableHead>Grandeza</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Limiar</TableHead>
                <TableHead>Disparo</TableHead>
                <TableHead>Resolução</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {a.status === "ativo" ? (
                      <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-300">
                        Resolvido
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.sev === "critico" ? "destructive" : "secondary"}>
                      {a.sev === "critico" ? "CRÍTICO" : "AVISO"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{LABELS[a.grandeza] ?? a.grandeza}</TableCell>
                  <TableCell>{a.valor}{a.unidade}</TableCell>
                  <TableCell className="text-muted-foreground">{a.limite}{a.unidade}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(a.timestamp * 1000).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.status === "resolvido" && a.resolvedAt
                      ? new Date(a.resolvedAt).toLocaleString("pt-BR")
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
