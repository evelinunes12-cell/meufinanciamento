import { useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";

interface Parcela {
  numero_parcela: number;
  data_vencimento: string;
  valor_parcela: number;
  pago: boolean;
  data_pagamento: string | null;
  antecipada: boolean;
  valor_pago: number | null;
  amortizacao: number | null;
  juros: number | null;
  economia: number | null;
  dias_antecedencia: number | null;
}

interface ExportButtonProps {
  parcelas: Parcela[];
  financiamento: {
    valor_financiado: number;
    valor_parcela: number;
    numero_parcelas: number;
    taxa_diaria: number;
    taxa_mensal: number;
  };
}

const ExportButton = ({ parcelas, financiamento }: ExportButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);

  const exportToCSV = () => {
    setIsExporting(true);

    try {
      const headers = [
        "Parcela",
        "Vencimento",
        "Valor Original",
        "Status",
        "Data Pagamento",
        "Valor Pago",
        "Economia",
        "Amortização",
        "Juros",
        "Dias Antecedência",
      ];

      const rows = parcelas.map((p) => [
        p.numero_parcela,
        format(parseISO(p.data_vencimento), "dd/MM/yyyy"),
        p.valor_parcela.toFixed(2).replace(".", ","),
        p.pago ? (p.antecipada ? "Antecipada" : "Paga") : "Pendente",
        p.data_pagamento ? format(parseISO(p.data_pagamento), "dd/MM/yyyy") : "",
        p.valor_pago?.toFixed(2).replace(".", ",") || "",
        p.economia?.toFixed(2).replace(".", ",") || "",
        p.amortizacao?.toFixed(2).replace(".", ",") || "",
        p.juros?.toFixed(2).replace(".", ",") || "",
        p.dias_antecedencia || "",
      ]);

      // Add summary
      const totalPago = parcelas.reduce((sum, p) => sum + (p.valor_pago || 0), 0);
      const totalEconomia = parcelas.reduce((sum, p) => sum + (p.economia || 0), 0);
      const totalAmortizacao = parcelas.reduce((sum, p) => sum + (p.amortizacao || 0), 0);

      rows.push([]);
      rows.push(["RESUMO"]);
      rows.push(["Valor Financiado", `R$ ${financiamento.valor_financiado.toFixed(2).replace(".", ",")}`]);
      rows.push(["Total Pago", `R$ ${totalPago.toFixed(2).replace(".", ",")}`]);
      rows.push(["Total Economia", `R$ ${totalEconomia.toFixed(2).replace(".", ",")}`]);
      rows.push(["Total Amortização", `R$ ${totalAmortizacao.toFixed(2).replace(".", ",")}`]);
      rows.push(["Taxa Diária", `${(financiamento.taxa_diaria * 100).toFixed(4)}%`]);
      rows.push(["Taxa Mensal", `${(financiamento.taxa_mensal * 100).toFixed(2)}%`]);

      const csvContent = [
        headers.join(";"),
        ...rows.map((row) => row.join(";")),
      ].join("\n");

      // Add BOM for Excel to recognize UTF-8
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `financiamento_parcelas_${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída!",
        description: "Arquivo CSV baixado com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar os dados",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = () => {
    // For Excel, we'll create an HTML table that Excel can open
    setIsExporting(true);

    try {
      const totalPago = parcelas.reduce((sum, p) => sum + (p.valor_pago || 0), 0);
      const totalEconomia = parcelas.reduce((sum, p) => sum + (p.economia || 0), 0);
      const totalAmortizacao = parcelas.reduce((sum, p) => sum + (p.amortizacao || 0), 0);

      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta charset="UTF-8"></head>
        <body>
          <h2>Meu Financiamento - Relatório de Parcelas</h2>
          <table border="1">
            <tr style="background-color: #158a5e; color: white; font-weight: bold;">
              <td>Parcela</td>
              <td>Vencimento</td>
              <td>Valor Original</td>
              <td>Status</td>
              <td>Data Pagamento</td>
              <td>Valor Pago</td>
              <td>Economia</td>
              <td>Amortização</td>
              <td>Juros</td>
              <td>Dias Antecedência</td>
            </tr>
            ${parcelas
              .map(
                (p) => `
              <tr>
                <td>${p.numero_parcela}</td>
                <td>${format(parseISO(p.data_vencimento), "dd/MM/yyyy")}</td>
                <td>R$ ${p.valor_parcela.toFixed(2)}</td>
                <td>${p.pago ? (p.antecipada ? "Antecipada" : "Paga") : "Pendente"}</td>
                <td>${p.data_pagamento ? format(parseISO(p.data_pagamento), "dd/MM/yyyy") : "-"}</td>
                <td>${p.valor_pago ? `R$ ${p.valor_pago.toFixed(2)}` : "-"}</td>
                <td style="color: ${p.economia && p.economia > 0 ? "green" : "black"}">${p.economia ? `R$ ${p.economia.toFixed(2)}` : "-"}</td>
                <td>${p.amortizacao ? `R$ ${p.amortizacao.toFixed(2)}` : "-"}</td>
                <td>${p.juros ? `R$ ${p.juros.toFixed(2)}` : "-"}</td>
                <td>${p.dias_antecedencia || "-"}</td>
              </tr>
            `
              )
              .join("")}
          </table>
          <br/>
          <h3>Resumo do Financiamento</h3>
          <table border="1">
            <tr><td><b>Valor Financiado</b></td><td>R$ ${financiamento.valor_financiado.toFixed(2)}</td></tr>
            <tr><td><b>Total Pago</b></td><td>R$ ${totalPago.toFixed(2)}</td></tr>
            <tr><td><b>Total Economia</b></td><td style="color: green">R$ ${totalEconomia.toFixed(2)}</td></tr>
            <tr><td><b>Total Amortização</b></td><td>R$ ${totalAmortizacao.toFixed(2)}</td></tr>
            <tr><td><b>Taxa Diária</b></td><td>${(financiamento.taxa_diaria * 100).toFixed(4)}%</td></tr>
            <tr><td><b>Taxa Mensal</b></td><td>${(financiamento.taxa_mensal * 100).toFixed(2)}%</td></tr>
          </table>
        </body>
        </html>
      `;

      const blob = new Blob([html], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `financiamento_parcelas_${format(new Date(), "yyyy-MM-dd")}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída!",
        description: "Arquivo Excel baixado com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar os dados",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportToCSV}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToExcel}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportButton;
