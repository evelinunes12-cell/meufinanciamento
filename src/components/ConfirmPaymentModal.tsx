import { useState, useEffect } from "react";
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
import { Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { formatCurrencyInput, parseCurrencyInput, formatCurrency } from "@/lib/calculations";

interface ConfirmPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transacaoId: string;
  valorPrevisto: number;
  descricao?: string | null;
}

const ConfirmPaymentModal = ({
  open,
  onOpenChange,
  transacaoId,
  valorPrevisto,
  descricao,
}: ConfirmPaymentModalProps) => {
  const queryClient = useQueryClient();
  const [valorPago, setValorPago] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      // Format the expected value for display
      const formatted = valorPrevisto.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      setValorPago(formatted);
    }
  }, [open, valorPrevisto]);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyInput(e.target.value);
    setValorPago(formatted);
  };

  const handleConfirm = async () => {
    const valor = parseCurrencyInput(valorPago);

    if (valor <= 0) {
      toast({
        title: "Erro",
        description: "Informe um valor válido",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("transacoes")
        .update({
          valor: valor,
          is_pago_executado: true,
          data_execucao_pagamento: format(new Date(), "yyyy-MM-dd"),
        })
        .eq("id", transacaoId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Pagamento confirmado com sucesso",
      });

      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-financas"] });
      queryClient.invalidateQueries({ queryKey: ["orcamentos"] });

      onOpenChange(false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error confirming payment:", error);
      }
      toast({
        title: "Erro",
        description: "Erro ao confirmar pagamento",
        variant: "destructive",
      });
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
