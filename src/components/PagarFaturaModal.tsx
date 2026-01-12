import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import { Wallet } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/calculations";

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
  contasDisponiveis: Conta[];
}

const PagarFaturaModal = ({
  open,
  onOpenChange,
  cartaoId,
  cartaoNome,
  valorFatura,
  contasDisponiveis,
}: PagarFaturaModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [contaOrigem, setContaOrigem] = useState("");
  const [loading, setLoading] = useState(false);

  // Filter only accounts that can be used as payment origin
  const contasValidas = contasDisponiveis.filter(
    (c) => c.tipo === "corrente" || c.tipo === "poupanca" || c.tipo === "carteira"
  );

  const handlePagarFatura = async () => {
    if (!contaOrigem) {
      toast({
        title: "Erro",
        description: "Selecione a conta de origem",
        variant: "destructive",
      });
      return;
    }

    if (valorFatura <= 0) {
      toast({
        title: "Erro",
        description: "Não há fatura a ser paga",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const contaOrigemNome = contasValidas.find((c) => c.id === contaOrigem)?.nome_conta || "";
      const dataHoje = format(new Date(), "yyyy-MM-dd");

      // Create outgoing transaction (from origin account)
      const transacaoSaida = {
        user_id: user?.id as string,
        conta_id: contaOrigem,
        categoria_id: null,
        valor: valorFatura,
        tipo: "despesa",
        data: dataHoje,
        forma_pagamento: "transferencia",
        recorrencia: "nenhuma",
        descricao: `Pagamento fatura ${cartaoNome}`,
        is_pago_executado: true,
        conta_destino_id: cartaoId,
      };

      // Create incoming transaction (to credit card account)
      const transacaoEntrada = {
        user_id: user?.id as string,
        conta_id: cartaoId,
        categoria_id: null,
        valor: valorFatura,
        tipo: "receita",
        data: dataHoje,
        forma_pagamento: "transferencia",
        recorrencia: "nenhuma",
        descricao: `Pagamento fatura de ${contaOrigemNome}`,
        is_pago_executado: true,
        conta_destino_id: null,
      };

      const { error: errorSaida } = await supabase.from("transacoes").insert(transacaoSaida);
      if (errorSaida) throw errorSaida;

      const { error: errorEntrada } = await supabase.from("transacoes").insert(transacaoEntrada);
      if (errorEntrada) throw errorEntrada;

      toast({
        title: "Sucesso",
        description: `Fatura de ${formatCurrency(valorFatura)} paga com sucesso`,
      });

      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-financas"] });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });

      setContaOrigem("");
      onOpenChange(false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error paying invoice:", error);
      }
      toast({
        title: "Erro",
        description: "Erro ao pagar fatura",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
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
            <p className="text-sm text-muted-foreground">Valor da Fatura</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(valorFatura)}</p>
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
            <p className="text-xs text-muted-foreground">
              Apenas contas corrente, poupança ou carteira podem ser usadas
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handlePagarFatura}
            disabled={loading || !contaOrigem || valorFatura <= 0}
            className="gradient-primary text-primary-foreground"
          >
            {loading ? "Pagando..." : "Pagar Fatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PagarFaturaModal;
