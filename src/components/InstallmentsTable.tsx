import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Calendar, Calculator, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { calcularAntecipacao, formatCurrency, formatCurrencyInput, parseCurrencyInput } from "@/lib/calculations";

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
  const [valorPagoManual, setValorPagoManual] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calculoRealizado, setCalculoRealizado] = useState(false);

  const handleOpenDialog = (parcela: Parcela) => {
    setSelectedParcela(parcela);
    setDataPagamento(new Date());
    setValorPagoManual("");
    setCalculoRealizado(false);
    setDialogOpen(true);
  };

  const handleCalcular = () => {
    if (!selectedParcela || !dataPagamento) return;
    setCalculoRealizado(true);
  };

  const calculo = selectedParcela && dataPagamento && calculoRealizado
    ? calcularAntecipacao(
        selectedParcela.valor_parcela,
        selectedParcela.data_vencimento,
        dataPagamento,
        taxaDiaria
      )
    : null;

  const handleConfirmarPagamento = async () => {
    if (!selectedParcela || !dataPagamento || !calculo) return;

    setIsLoading(true);

    try {
      const valorFinal = valorPagoManual
        ? parseCurrencyInput(valorPagoManual)
        : calculo.valorPago;

      const economiaFinal = selectedParcela.valor_parcela - valorFinal;

      const { error } = await supabase
        .from("parcelas")
        .update({
          pago: true,
          data_pagamento: format(dataPagamento, "yyyy-MM-dd"),
          antecipada: calculo.isAntecipada,
          valor_pago: valorFinal,
          economia: Math.max(0, economiaFinal),
          dias_antecedencia: calculo.diasAntecedencia,
          juros: calculo.juros,
          amortizacao: calculo.amortizacao,
        })
        .eq("id", selectedParcela.id);

      if (error) throw error;

      toast({
        title: "Pagamento registrado!",
        description: calculo.isAntecipada
          ? `Economia de ${formatCurrency(economiaFinal)} com ${calculo.diasAntecedencia} dias de antecedência`
          : calculo.isAtrasada
          ? "Pagamento registrado (atrasado)"
          : "Pagamento registrado no vencimento",
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

  return (
    <>
      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-16 text-center">Nº</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor Original</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Valor Pago</TableHead>
                <TableHead className="text-right">Economia</TableHead>
                <TableHead className="text-right">Amortização</TableHead>
                <TableHead className="text-center">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcelas.map((parcela, index) => (
                <TableRow
                  key={parcela.id}
                  className={cn(
                    "transition-colors",
                    parcela.pago && parcela.antecipada && "bg-success/5",
                    parcela.pago && !parcela.antecipada && "bg-muted/30"
                  )}
                  style={{ animationDelay: `${index * 20}ms` }}
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
                      <Badge
                        variant="default"
                        className={cn(
                          parcela.antecipada
                            ? "bg-success text-success-foreground"
                            : "bg-primary text-primary-foreground"
                        )}
                      >
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
                      <span className="text-success font-semibold">
                        {formatCurrency(parcela.economia)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {parcela.pago ? formatCurrency(parcela.amortizacao) : "-"}
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
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Registrar Pagamento - Parcela {selectedParcela?.numero_parcela}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Info da Parcela */}
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Valor Original:</span>
                  <p className="font-semibold text-lg">
                    {formatCurrency(selectedParcela?.valor_parcela || 0)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Vencimento:</span>
                  <p className="font-semibold">
                    {selectedParcela &&
                      format(parseISO(selectedParcela.data_vencimento), "dd/MM/yyyy")}
                  </p>
                </div>
              </div>
            </div>

            {/* Data do Pagamento */}
            <div className="space-y-2">
              <Label className="text-base">Data do Pagamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-12",
                      !dataPagamento && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dataPagamento
                      ? format(dataPagamento, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                      : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dataPagamento}
                    onSelect={(date) => {
                      setDataPagamento(date);
                      setCalculoRealizado(false);
                    }}
                    locale={ptBR}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Botão Calcular */}
            {!calculoRealizado && (
              <Button
                onClick={handleCalcular}
                variant="secondary"
                className="w-full h-12"
                disabled={!dataPagamento}
              >
                <Calculator className="mr-2 h-5 w-5" />
                Calcular Valor
              </Button>
            )}

            {/* Resultado do Cálculo */}
            {calculo && calculoRealizado && (
              <div className="space-y-4 animate-fade-in">
                {calculo.isAtrasada && (
                  <div className="rounded-lg bg-destructive/10 p-3 flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      Pagamento após o vencimento - sem desconto
                    </span>
                  </div>
                )}

                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <h4 className="font-semibold text-foreground">Resultado do Cálculo</h4>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Dias de Antecedência:</span>
                      <p className="font-semibold text-lg">
                        {calculo.diasAntecedencia} dias
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Taxa Diária:</span>
                      <p className="font-semibold">
                        {(taxaDiaria * 100).toFixed(4)}%
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor Original:</span>
                      <span>{formatCurrency(calculo.valorOriginal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor com Desconto:</span>
                      <span className="font-semibold text-success text-lg">
                        {formatCurrency(calculo.valorPago)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Economia:</span>
                      <span className="font-bold text-success">
                        {formatCurrency(calculo.economia)}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Juros (estimado):</span>
                      <span>{formatCurrency(calculo.juros)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amortização:</span>
                      <span className="font-medium">{formatCurrency(calculo.amortizacao)}</span>
                    </div>
                  </div>
                </div>

                {/* Valor Manual (opcional) */}
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Valor Pago (opcional - deixe vazio para usar o calculado)
                  </Label>
                  <Input
                    placeholder="0,00"
                    value={valorPagoManual}
                    onChange={(e) => setValorPagoManual(formatCurrencyInput(e.target.value))}
                    className="h-11"
                  />
                </div>

                {/* Botão Confirmar */}
                <Button
                  onClick={handleConfirmarPagamento}
                  className="w-full h-12"
                  variant="hero"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-5 w-5" />
                      Confirmar Pagamento
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InstallmentsTable;
