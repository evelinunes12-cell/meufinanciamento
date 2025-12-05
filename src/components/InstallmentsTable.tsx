import { useState } from "react";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Calendar, Calculator, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Parcela {
  id: string;
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

interface InstallmentsTableProps {
  parcelas: Parcela[];
  taxaDiaria: number;
  onUpdate: () => void;
}

const InstallmentsTable = ({ parcelas, taxaDiaria, onUpdate }: InstallmentsTableProps) => {
  const [selectedParcela, setSelectedParcela] = useState<Parcela | null>(null);
  const [dataPagamento, setDataPagamento] = useState<Date>();
  const [valorPago, setValorPago] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const formatCurrency = (value: number | null) => {
    if (value === null) return "-";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const calculateDiscount = (valorOriginal: number, dataVencimento: string, dataPag: Date) => {
    const vencimento = parseISO(dataVencimento);
    const diasAntecedencia = differenceInDays(vencimento, dataPag);

    if (diasAntecedencia <= 0) {
      return {
        valorComDesconto: valorOriginal,
        economia: 0,
        diasAntecedencia: 0,
        juros: 0,
        amortizacao: valorOriginal,
      };
    }

    // Cálculo do desconto usando a taxa diária
    const fatorDesconto = Math.pow(1 + taxaDiaria, diasAntecedencia);
    const valorComDesconto = valorOriginal / fatorDesconto;
    const economia = valorOriginal - valorComDesconto;

    // Estimativa de juros e amortização
    const jurosEstimado = valorOriginal * taxaDiaria * 30; // juros aproximado mensal
    const amortizacao = valorComDesconto - jurosEstimado;

    return {
      valorComDesconto: Math.round(valorComDesconto * 100) / 100,
      economia: Math.round(economia * 100) / 100,
      diasAntecedencia,
      juros: Math.max(0, Math.round(jurosEstimado * 100) / 100),
      amortizacao: Math.max(0, Math.round(amortizacao * 100) / 100),
    };
  };

  const handleOpenDialog = (parcela: Parcela) => {
    setSelectedParcela(parcela);
    setDataPagamento(new Date());
    setValorPago("");
    setDialogOpen(true);
  };

  const handlePagar = async () => {
    if (!selectedParcela || !dataPagamento) return;

    setIsLoading(true);

    try {
      const calculo = calculateDiscount(
        selectedParcela.valor_parcela,
        selectedParcela.data_vencimento,
        dataPagamento
      );

      const valorFinal = valorPago
        ? parseFloat(valorPago.replace(/\D/g, "")) / 100
        : calculo.valorComDesconto;

      const { error } = await supabase
        .from("parcelas")
        .update({
          pago: true,
          data_pagamento: format(dataPagamento, "yyyy-MM-dd"),
          antecipada: calculo.diasAntecedencia > 0,
          valor_pago: valorFinal,
          economia: calculo.economia,
          dias_antecedencia: calculo.diasAntecedencia,
          juros: calculo.juros,
          amortizacao: calculo.amortizacao,
        })
        .eq("id", selectedParcela.id);

      if (error) throw error;

      toast({
        title: "Parcela registrada!",
        description:
          calculo.diasAntecedencia > 0
            ? `Economia de ${formatCurrency(calculo.economia)} com ${calculo.diasAntecedencia} dias de antecedência`
            : "Pagamento registrado com sucesso",
      });

      setDialogOpen(false);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const previewCalculo = selectedParcela && dataPagamento
    ? calculateDiscount(selectedParcela.valor_parcela, selectedParcela.data_vencimento, dataPagamento)
    : null;

  return (
    <>
      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-16 text-center">Nº</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Pago</TableHead>
              <TableHead className="text-right">Economia</TableHead>
              <TableHead className="text-center">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parcelas.map((parcela, index) => (
              <TableRow
                key={parcela.id}
                className={cn(
                  "transition-colors",
                  parcela.pago && "bg-success/5"
                )}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <TableCell className="text-center font-medium">
                  {parcela.numero_parcela}
                </TableCell>
                <TableCell>
                  {format(parseISO(parcela.data_vencimento), "dd/MM/yyyy")}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(parcela.valor_parcela)}
                </TableCell>
                <TableCell className="text-center">
                  {parcela.pago ? (
                    <Badge variant="default" className="bg-success text-success-foreground">
                      <Check className="mr-1 h-3 w-3" />
                      {parcela.antecipada ? "Antecipada" : "Paga"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pendente</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {parcela.pago ? formatCurrency(parcela.valor_pago) : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {parcela.economia && parcela.economia > 0 ? (
                    <span className="text-success font-medium">
                      {formatCurrency(parcela.economia)}
                    </span>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {!parcela.pago && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenDialog(parcela)}
                    >
                      <Calculator className="mr-1 h-4 w-4" />
                      Pagar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Registrar Pagamento - Parcela {selectedParcela?.numero_parcela}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Data do Pagamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dataPagamento && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dataPagamento
                      ? format(dataPagamento, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                      : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={dataPagamento}
                    onSelect={setDataPagamento}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {previewCalculo && (
              <div className="rounded-lg bg-accent/50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor Original:</span>
                  <span className="font-medium">
                    {formatCurrency(selectedParcela?.valor_parcela || 0)}
                  </span>
                </div>
                {previewCalculo.diasAntecedencia > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Dias de Antecedência:</span>
                      <span className="font-medium">{previewCalculo.diasAntecedencia}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor com Desconto:</span>
                      <span className="font-medium text-success">
                        {formatCurrency(previewCalculo.valorComDesconto)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-border pt-2">
                      <span className="text-muted-foreground">Economia:</span>
                      <span className="font-bold text-success">
                        {formatCurrency(previewCalculo.economia)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="valorPago">
                Valor Pago (opcional - deixe vazio para usar o calculado)
              </Label>
              <Input
                id="valorPago"
                placeholder="0,00"
                value={valorPago}
                onChange={(e) => {
                  const numbers = e.target.value.replace(/\D/g, "");
                  const amount = parseFloat(numbers) / 100;
                  if (isNaN(amount)) {
                    setValorPago("");
                  } else {
                    setValorPago(
                      amount.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    );
                  }
                }}
              />
            </div>

            <Button
              onClick={handlePagar}
              className="w-full"
              variant="hero"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirmar Pagamento
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InstallmentsTable;
