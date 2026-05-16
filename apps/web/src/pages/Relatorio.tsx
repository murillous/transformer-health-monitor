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
