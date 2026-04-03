import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wallet, Info } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/calculations";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Conta {
  id: string;
  nome_conta: string;
  tipo: string;
}

interface PagarFaturaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartaoId: string;
  cartaoNome: string;
  valorFatura: number;
  vencimentoFatura: string;
  contasDisponiveis: Conta[];
}

const PagarFaturaModal = ({
  open,
  onOpenChange,
  cartaoId,
  cartaoNome,
  valorFatura,
  vencimentoFatura,
  contasDisponiveis = [],
}: PagarFaturaModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [contaOrigem, setContaOrigem] = useState("");
  const [valorPagamento, setValorPagamento] = useState("");
  const [loading, setLoading] = useState(false);

  // Reset valor when modal opens
  useEffect(() => {
    if (open) {
      setValorPagamento(valorFatura.toFixed(2).replace(".", ","));
    }
  }, [open, valorFatura]);

  // Filter only accounts that can be used as payment origin
  const contasValidas = contasDisponiveis.filter(
    (c) => c.tipo === "corrente" || c.tipo === "poupanca" || c.tipo === "carteira"
  );

  const parseValor = (val: string): number => {
    return Number(val.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const valorPago = parseValor(valorPagamento);
  const isParcial = valorPago > 0 && valorPago < valorFatura;
  const isTotal = valorPago >= valorFatura;

  const handlePagarFatura = async () => {
    if (!contaOrigem) {
      toast({ title: "Erro", description: "Selecione a conta de origem", variant: "destructive" });
      return;
    }

    if (valorPago <= 0) {
      toast({ title: "Erro", description: "Informe um valor válido", variant: "destructive" });
      return;
    }

    if (valorPago > valorFatura) {
      toast({ title: "Erro", description: "O valor não pode ser maior que a fatura", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const contaOrigemNome = contasValidas.find((c) => c.id === contaOrigem)?.nome_conta || "";
      const dataHoje = format(new Date(), "yyyy-MM-dd");
      const descricaoTipo = isParcial ? "Pagamento parcial" : "Pagamento";

      // Create outgoing transaction (from origin account)
      const transacaoSaida = {
        user_id: user?.id as string,
        conta_id: contaOrigem,
        categoria_id: null,
        valor: valorPago,
        tipo: "despesa",
        data: dataHoje,
        forma_pagamento: "transferencia",
        recorrencia: "nenhuma",
        descricao: `${descricaoTipo} fatura ${cartaoNome}`,
        is_pago_executado: true,
        conta_destino_id: cartaoId,
      };

      // Create incoming transaction (to credit card account)
      const transacaoEntrada = {
        user_id: user?.id as string,
        conta_id: cartaoId,
        categoria_id: null,
        valor: valorPago,
        tipo: "receita",
        data: dataHoje,
        forma_pagamento: "transferencia",
        recorrencia: "nenhuma",
        descricao: `${descricaoTipo} fatura de ${contaOrigemNome}`,
        is_pago_executado: true,
        conta_destino_id: null,
      };

      const { error: errorSaida } = await supabase.from("transacoes").insert(transacaoSaida);
      if (errorSaida) throw errorSaida;

      const { error: errorEntrada } = await supabase.from("transacoes").insert(transacaoEntrada);
      if (errorEntrada) throw errorEntrada;

      // Se pagamento total, marcar transações da fatura como pagas
      if (isTotal) {
        // Marca TODAS as transações não pagas do cartão com data_pagamento <= vencimento da fatura
        // Isso inclui faturas anteriores acumuladas
        const cutoffDate = vencimentoFatura || dataHoje;
        
        const { error: updateError, data: updatedTransactions } = await supabase
          .from("transacoes")
          .update({
            is_pago_executado: true,
            data_execucao_pagamento: dataHoje,
          })
          .eq("conta_id", cartaoId)
          .eq("tipo", "despesa")
          .eq("is_pago_executado", false)
          .select("id");

        if (updateError) {
          console.warn("Warning: Could not update transaction status:", updateError);
        }

        const transacoesQuitadas = updatedTransactions?.length || 0;
        
        toast({
          title: "Fatura paga!",
          description: `${formatCurrency(valorPago)} pago com sucesso${transacoesQuitadas > 0 ? ` (${transacoesQuitadas} transações quitadas)` : ""}`,
        });
      } else {
        // Pagamento parcial: não quita as transações individuais
        toast({
          title: "Pagamento parcial registrado",
          description: `${formatCurrency(valorPago)} de ${formatCurrency(valorFatura)} pago. Restam ${formatCurrency(valorFatura - valorPago)}.`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-financas"] });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });

      setContaOrigem("");
      setValorPagamento("");
      onOpenChange(false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error paying invoice:", error);
      }
      toast({ title: "Erro", description: "Erro ao pagar fatura", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^\d,]/g, "");
    setValorPagamento(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar Fatura</DialogTitle>
          <DialogDescription>
            Pagar fatura do cartão <strong>{cartaoNome}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Valor Total da Fatura</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(valorFatura)}</p>
            {vencimentoFatura && (
              <p className="text-xs text-muted-foreground mt-1">
                Vencimento: {format(new Date(vencimentoFatura + "T12:00:00"), "dd/MM/yyyy")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>Valor do Pagamento *</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    Pague o valor total para quitar todas as transações da fatura, ou um valor parcial (mínimo).
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={valorPagamento}
              onChange={handleValorChange}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setValorPagamento(valorFatura.toFixed(2).replace(".", ","))}
              >
                Valor total
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setValorPagamento((valorFatura * 0.15).toFixed(2).replace(".", ","))}
              >
                Mínimo (~15%)
              </Button>
            </div>
            {isParcial && (
              <p className="text-xs text-warning">
                ⚠ Pagamento parcial: as transações da fatura continuarão pendentes. Restarão {formatCurrency(valorFatura - valorPago)}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Conta de Origem *</Label>
            <Select value={contaOrigem} onValueChange={setContaOrigem}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta">
                  {contaOrigem && (
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      {contasValidas.find((c) => c.id === contaOrigem)?.nome_conta}
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {contasValidas.length === 0 ? (
                  <div className="p-2 text-center text-muted-foreground text-sm">
                    Nenhuma conta disponível
                  </div>
                ) : (
                  contasValidas.map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        {conta.nome_conta}
                        <span className="text-xs text-muted-foreground capitalize">
                          ({conta.tipo})
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handlePagarFatura}
            disabled={loading || !contaOrigem || valorPago <= 0}
            className="gradient-primary text-primary-foreground"
          >
            {loading ? "Pagando..." : isParcial ? "Pagar Parcial" : "Pagar Fatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PagarFaturaModal;
