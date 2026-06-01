import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Check } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "@/hooks/use-toast";
import {
  formatCurrencyInput,
  parseCurrencyInput,
  formatCurrency,
  calcularJurosMulta,
} from "@/lib/calculations";

interface ConfirmPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transacaoId: string;
  valorPrevisto: number;
  descricao?: string | null;
  /** Data de vencimento da transação (yyyy-MM-dd). Usada para calcular multa/juros se atrasada. */
  dataVencimento?: string | null;
}

const ConfirmPaymentModal = ({
  open,
  onOpenChange,
  transacaoId,
  valorPrevisto,
  descricao,
  dataVencimento,
}: ConfirmPaymentModalProps) => {
  const queryClient = useQueryClient();
  const [valorPago, setValorPago] = useState("");
  const [dataExecucao, setDataExecucao] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [aplicarEncargos, setAplicarEncargos] = useState(true);

  const encargos = useMemo(() => {
    if (!dataVencimento) return null;
    try {
      return calcularJurosMulta(valorPrevisto, dataVencimento, parseISO(dataExecucao));
    } catch {
      return null;
    }
  }, [valorPrevisto, dataVencimento, dataExecucao]);

  const isAtrasado = !!encargos && encargos.diasAtraso > 0;

  // Sugere valor automaticamente quando abre / muda data execução / toggle encargos
  useEffect(() => {
    if (!open) return;
    const base = isAtrasado && aplicarEncargos ? encargos!.valorSugerido : valorPrevisto;
    const formatted = base.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    setValorPago(formatted);
  }, [open, valorPrevisto, isAtrasado, aplicarEncargos, encargos?.valorSugerido]);

  useEffect(() => {
    if (open) {
      setDataExecucao(format(new Date(), "yyyy-MM-dd"));
      setAplicarEncargos(true);
    }
  }, [open]);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValorPago(formatCurrencyInput(e.target.value));
  };

  const handleConfirm = async () => {
    const valor = parseCurrencyInput(valorPago);

    if (valor <= 0) {
      toast({ title: "Erro", description: "Informe um valor válido", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("transacoes")
        .update({
          valor: valor,
          is_pago_executado: true,
          data_execucao_pagamento: dataExecucao,
        })
        .eq("id", transacaoId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: isAtrasado
          ? `Pagamento confirmado com ${encargos!.diasAtraso} dia(s) de atraso`
          : "Pagamento confirmado com sucesso",
      });

      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-financas"] });
      queryClient.invalidateQueries({ queryKey: ["orcamentos"] });

      onOpenChange(false);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Error confirming payment:", error);
      toast({ title: "Erro", description: "Erro ao confirmar pagamento", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-success" />
            Confirmar Pagamento
          </DialogTitle>
          <DialogDescription>
            {descricao ? `"${descricao}"` : "Confirme o pagamento desta transação"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Valor Previsto</p>
            <p className="text-lg font-medium text-foreground">{formatCurrency(valorPrevisto)}</p>
          </div>

          {isAtrasado && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-xs font-semibold">
                  Pagamento atrasado em {encargos!.diasAtraso} dia(s)
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Multa (2%)</span>
                  <span className="font-medium">{formatCurrency(encargos!.multa)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Juros de mora (~1%/mês)
                  </span>
                  <span className="font-medium">{formatCurrency(encargos!.jurosMora)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-destructive/20">
                  <span className="text-muted-foreground">Valor sugerido</span>
                  <span className="font-semibold text-destructive">
                    {formatCurrency(encargos!.valorSugerido)}
                  </span>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={aplicarEncargos}
                  onChange={(e) => setAplicarEncargos(e.target.checked)}
                  className="accent-destructive"
                />
                <span>Aplicar multa e juros ao valor pago</span>
              </label>
            </div>
          )}

          <div className="space-y-2">
            <Label>Valor Pago *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                R$
              </span>
              <Input
                value={valorPago}
                onChange={handleValorChange}
                placeholder="0,00"
                className="pl-10"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Ajuste o valor se necessário antes de confirmar
            </p>
          </div>

          <div className="space-y-2">
            <Label>Data de Execução</Label>
            <Input
              type="date"
              value={dataExecucao}
              onChange={(e) => setDataExecucao(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use a data real em que o pagamento foi efetuado
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-success hover:bg-success/90 text-success-foreground"
          >
            {loading ? "Confirmando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmPaymentModal;
