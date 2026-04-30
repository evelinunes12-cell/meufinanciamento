import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, CalendarClock, Wallet } from "lucide-react";
import { addMonths, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { calculateCardDueDate, calculateInstallmentDueDate } from "@/lib/calculations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartaoId: string;
  cartaoNome: string;
  cartaoFechamento: number;
  cartaoVencimento: number;
  valorFatura: number;
  vencimentoFatura: string; // 'yyyy-MM-dd'
  mesReferencia: string; // 'yyyy-MM' for the closed invoice being parceled
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Find or create the "Cartão de Crédito · {nome}" parent category and a given
 * subcategory ('Crédito de Ajuste' | 'Parcelamento de Fatura') for this user.
 * Returns the subcategory id.
 */
async function ensureCartaoCategoria(
  userId: string,
  cartaoNome: string,
  subNome: "Crédito de Ajuste" | "Parcelamento de Fatura",
  tipoSub: "receita" | "despesa"
): Promise<string> {
  const parentNome = `Cartão de Crédito · ${cartaoNome}`;

  // Parent category — keep tipo 'despesa' since cards are an expense bucket
  const { data: existingParents } = await supabase
    .from("categorias")
    .select("id, tipo")
    .eq("user_id", userId)
    .eq("nome", parentNome)
    .is("categoria_pai_id", null);

  let parentId = existingParents?.[0]?.id;
  if (!parentId) {
    const { data: created, error } = await supabase
      .from("categorias")
      .insert({
        user_id: userId,
        nome: parentNome,
        tipo: "despesa",
        cor: "#6366F1",
        icone: "credit-card",
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message || "Erro ao criar categoria pai");
    parentId = created.id;
  }

  // Sub category
  const { data: existingSubs } = await supabase
    .from("categorias")
    .select("id")
    .eq("user_id", userId)
    .eq("nome", subNome)
    .eq("categoria_pai_id", parentId);

  if (existingSubs && existingSubs.length > 0) return existingSubs[0].id;

  const { data: subCreated, error: subError } = await supabase
    .from("categorias")
    .insert({
      user_id: userId,
      nome: subNome,
      tipo: tipoSub,
      cor: tipoSub === "receita" ? "#10B981" : "#EF4444",
      icone: tipoSub === "receita" ? "trending-up" : "credit-card",
      categoria_pai_id: parentId,
    })
    .select("id")
    .single();
  if (subError || !subCreated) throw new Error(subError?.message || "Erro ao criar subcategoria");
  return subCreated.id;
}

const ParcelarFaturaModal = ({
  open,
  onOpenChange,
  cartaoId,
  cartaoNome,
  cartaoFechamento,
  cartaoVencimento,
  valorFatura,
  vencimentoFatura,
  mesReferencia,
}: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [entrada, setEntrada] = useState("0");
  const [numeroParcelas, setNumeroParcelas] = useState("3");
  const [valorParcela, setValorParcela] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setEntrada("0");
      setNumeroParcelas("3");
      // Suggest a default installment value
      const sugerido = valorFatura > 0 ? valorFatura / 3 : 0;
      setValorParcela(sugerido > 0 ? sugerido.toFixed(2) : "");
    }
  }, [open, valorFatura]);

  const entradaNum = useMemo(() => parseFloat(entrada.replace(",", ".")) || 0, [entrada]);
  const nParcelas = useMemo(() => Math.max(1, parseInt(numeroParcelas) || 1), [numeroParcelas]);
  const valorParcelaNum = useMemo(
    () => parseFloat(valorParcela.replace(",", ".")) || 0,
    [valorParcela]
  );

  const totalParcelado = useMemo(() => valorParcelaNum * nParcelas, [valorParcelaNum, nParcelas]);
  const totalCobrado = useMemo(() => entradaNum + totalParcelado, [entradaNum, totalParcelado]);
  const jurosEstimado = useMemo(() => Math.max(0, totalCobrado - valorFatura), [totalCobrado, valorFatura]);
  const valorRestante = useMemo(() => Math.max(0, valorFatura - entradaNum), [valorFatura, entradaNum]);

  const handleConfirm = async () => {
    if (!user?.id) return;
    if (valorFatura <= 0) {
      toast({ title: "Fatura sem valor", description: "Não há valor a parcelar.", variant: "destructive" });
      return;
    }
    if (entradaNum < 0 || entradaNum > valorFatura) {
      toast({
        title: "Entrada inválida",
        description: "A entrada deve ser entre 0 e o valor total da fatura.",
        variant: "destructive",
      });
      return;
    }
    if (nParcelas < 1) {
      toast({ title: "Parcelas inválidas", description: "Informe pelo menos 1 parcela.", variant: "destructive" });
      return;
    }
    if (valorParcelaNum <= 0) {
      toast({ title: "Valor da parcela inválido", description: "Informe o valor de cada parcela.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // 1. Ensure categories exist
      const ajusteCategoriaId = await ensureCartaoCategoria(
        user.id,
        cartaoNome,
        "Crédito de Ajuste",
        "receita"
      );
      const parcelamentoCategoriaId = await ensureCartaoCategoria(
        user.id,
        cartaoNome,
        "Parcelamento de Fatura",
        "despesa"
      );

      // 2. Insert credit adjustment (receita) on the closed invoice
      // It abates the closed invoice so only the entrada remains to be paid.
      const dataAjuste = vencimentoFatura; // belongs to the closed invoice cycle
      const { error: ajusteError } = await supabase.from("transacoes").insert({
        user_id: user.id,
        conta_id: cartaoId,
        categoria_id: ajusteCategoriaId,
        tipo: "receita",
        valor: valorRestante,
        data: dataAjuste,
        data_pagamento: vencimentoFatura,
        forma_pagamento: "credito",
        recorrencia: "nenhuma",
        descricao: `Crédito de Ajuste - Parcelamento (${valorRestante > 0 ? formatCurrency(valorRestante) : "0"})`,
        is_pago_executado: false,
        mes_fatura_override: mesReferencia,
      });
      if (ajusteError) throw new Error(ajusteError.message);

      // 3. Insert N installment expenses pushed to subsequent invoice months
      const baseDueDate = parseISO(vencimentoFatura);
      const rows = Array.from({ length: nParcelas }).map((_, i) => {
        const installmentIndex = i + 1; // start NEXT month, not current
        const targetDueDate = calculateInstallmentDueDate(
          baseDueDate,
          installmentIndex,
          cartaoVencimento || baseDueDate.getDate()
        );
        const targetMonthRef = format(targetDueDate, "yyyy-MM");
        return {
          user_id: user.id,
          conta_id: cartaoId,
          categoria_id: parcelamentoCategoriaId,
          tipo: "despesa",
          valor: valorParcelaNum,
          data: format(targetDueDate, "yyyy-MM-dd"),
          data_pagamento: format(targetDueDate, "yyyy-MM-dd"),
          forma_pagamento: "credito",
          recorrencia: "nenhuma",
          descricao: `Parcelamento de Fatura (${i + 1}/${nParcelas})`,
          is_pago_executado: false,
          parcela_atual: i + 1,
          parcelas_total: nParcelas,
          mes_fatura_override: targetMonthRef,
        };
      });

      const { error: parcelasError } = await supabase.from("transacoes").insert(rows);
      if (parcelasError) throw new Error(parcelasError.message);

      toast({
        title: "Fatura parcelada com sucesso",
        description: `${nParcelas}x de ${formatCurrency(valorParcelaNum)} criada(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao parcelar fatura";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Parcelar Fatura
          </DialogTitle>
          <DialogDescription className="text-xs">
            {cartaoNome}{vencimentoFatura ? ` · venc. ${format(parseISO(vencimentoFatura), "dd/MM/yyyy", { locale: ptBR })}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="rounded-md bg-muted/40 p-3 border border-border">
            <p className="text-xs text-muted-foreground">Valor total da fatura</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(valorFatura)}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entrada" className="text-xs">Valor da entrada</Label>
            <Input
              id="entrada"
              type="number"
              step="0.01"
              min={0}
              max={valorFatura}
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              className="h-9"
            />
            <p className="text-[11px] text-muted-foreground">
              Pago agora junto com a fatura: {formatCurrency(entradaNum)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="numeroParcelas" className="text-xs">Nº de parcelas</Label>
              <Input
                id="numeroParcelas"
                type="number"
                min={1}
                max={36}
                value={numeroParcelas}
                onChange={(e) => setNumeroParcelas(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valorParcela" className="text-xs">Valor da parcela</Label>
              <Input
                id="valorParcela"
                type="number"
                step="0.01"
                min={0}
                value={valorParcela}
                onChange={(e) => setValorParcela(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-1.5 bg-card">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Valor restante a parcelar</span>
              <span className="font-medium">{formatCurrency(valorRestante)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total das parcelas ({nParcelas}x)</span>
              <span className="font-medium">{formatCurrency(totalParcelado)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total cobrado (entrada + parcelas)</span>
              <span className="font-semibold">{formatCurrency(totalCobrado)}</span>
            </div>
            {jurosEstimado > 0 && (
              <div className="flex justify-between text-xs pt-1.5 border-t border-border">
                <span className="text-warning flex items-center gap-1">
                  <Wallet className="h-3 w-3" /> Juros estimados
                </span>
                <span className="font-semibold text-warning">{formatCurrency(jurosEstimado)}</span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Será criado um <strong>Crédito de Ajuste</strong> nesta fatura abatendo {formatCurrency(valorRestante)}, e {nParcelas} despesas
            "Parcelamento de Fatura" serão lançadas nas próximas faturas.
          </p>
        </div>

        <div className="px-5 py-3 border-t bg-muted/30 flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar parcelamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ParcelarFaturaModal;
