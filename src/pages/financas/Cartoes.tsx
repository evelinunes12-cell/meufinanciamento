import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CreditCard, Calendar, AlertTriangle, Banknote, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import PagarFaturaModal from "@/components/PagarFaturaModal";

interface Conta {
  id: string;
  nome_conta: string;
  cor: string;
  tipo: string;
  limite: number | null;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}

interface Transacao {
  id: string;
  conta_id: string;
  valor: number;
  tipo: string;
  data: string; // data da compra
  data_pagamento: string | null; // data de vencimento (calculada)
  is_pago_executado: boolean | null;
  descricao: string | null;
  parcela_atual: number | null;
  parcelas_total: number | null;
}

// ==========================================
// Lógica de ciclo de fatura de cartão de crédito
// ==========================================
// Regra real: uma compra feita no dia X pertence à fatura que fecha no dia_fechamento.
// - Se X < dia_fechamento → pertence à fatura que fecha neste mesmo mês
// - Se X >= dia_fechamento → pertence à fatura que fecha no mês seguinte
// O vencimento da fatura é dia_vencimento do mês seguinte ao fechamento.

/**
 * Retorna as informações da fatura FECHADA mais recente (pronta para pagar)
 * e da fatura ABERTA (ciclo atual).
 */
function getFaturasInfo(cartao: Conta, hoje: Date = new Date()) {
  const diaFechamento = cartao.dia_fechamento || 1;
  const diaVencimento = cartao.dia_vencimento || 10;
  const diaHoje = hoje.getDate();
  const mesHoje = hoje.getMonth();
  const anoHoje = hoje.getFullYear();

  // --- Fatura ABERTA (ciclo atual em curso) ---
  let abertaInicio: Date;
  let abertaFim: Date;

  if (diaHoje >= diaFechamento) {
    // Já passou o fechamento neste mês → ciclo aberto vai de hoje até fechamento do próximo mês
    abertaInicio = new Date(anoHoje, mesHoje, diaFechamento + 1);
    abertaFim = new Date(anoHoje, mesHoje + 1, diaFechamento);
  } else {
    // Ainda não fechou → ciclo aberto vai do fechamento do mês passado + 1 até o fechamento deste mês
    abertaInicio = new Date(anoHoje, mesHoje - 1, diaFechamento + 1);
    abertaFim = new Date(anoHoje, mesHoje, diaFechamento);
  }

  // --- Fatura FECHADA mais recente ---
  let fechadaFim: Date;
  let fechadaInicio: Date;
  let fechadaVencimento: Date;

  if (diaHoje >= diaFechamento) {
    // O fechamento deste mês já ocorreu
    fechadaFim = new Date(anoHoje, mesHoje, diaFechamento);
    fechadaInicio = new Date(anoHoje, mesHoje - 1, diaFechamento + 1);
    fechadaVencimento = new Date(anoHoje, mesHoje, diaVencimento);
  } else {
    // O fechamento deste mês ainda não ocorreu → a mais recente é do mês passado
    fechadaFim = new Date(anoHoje, mesHoje - 1, diaFechamento);
    fechadaInicio = new Date(anoHoje, mesHoje - 2, diaFechamento + 1);
    fechadaVencimento = new Date(anoHoje, mesHoje - 1, diaVencimento);
  }

  return {
    aberta: {
      inicio: format(abertaInicio, "yyyy-MM-dd"),
      fim: format(abertaFim, "yyyy-MM-dd"),
    },
    fechada: {
      inicio: format(fechadaInicio, "yyyy-MM-dd"),
      fim: format(fechadaFim, "yyyy-MM-dd"),
      vencimento: fechadaVencimento,
      mesReferencia: format(fechadaFim, "MMMM/yyyy", { locale: ptBR }),
    },
  };
}

async function fetchCartoesData(userId: string | undefined) {
  if (!userId) return null;

  const [cartoesRes, transacoesRes, contasRes] = await Promise.all([
    supabase.from("contas").select("*").eq("tipo", "credito"),
    supabase
      .from("transacoes")
      .select("id, conta_id, valor, tipo, data, data_pagamento, is_pago_executado, descricao, parcela_atual, parcelas_total")
      .eq("tipo", "despesa"),
    supabase.from("contas").select("*"),
  ]);

  return {
    cartoes: (cartoesRes.data || []) as Conta[],
    transacoes: (transacoesRes.data || []) as Transacao[],
    todasContas: (contasRes.data || []) as Conta[],
  };
}

const Cartoes = () => {
  const { user } = useAuth();
  const [faturaModal, setFaturaModal] = useState<{
    open: boolean;
    cartaoId: string;
    cartaoNome: string;
    valorFatura: number;
    vencimentoFatura: string;
  }>({ open: false, cartaoId: "", cartaoNome: "", valorFatura: 0, vencimentoFatura: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["cartoes", user?.id],
    queryFn: () => fetchCartoesData(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const cartoes = data?.cartoes || [];
  const transacoes = data?.transacoes || [];
  const todasContas = data?.todasContas || [];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  /**
   * Filtra transações do cartão que pertencem a um ciclo de fatura específico,
   * baseado na DATA DA COMPRA (data), não na data de vencimento.
   */
  const getTransacoesCiclo = (cartaoId: string, inicio: string, fim: string) => {
    return transacoes.filter(t => {
      if (t.conta_id !== cartaoId) return false;
      // Usa a data da compra para determinar em qual ciclo a transação pertence
      return t.data >= inicio && t.data <= fim;
    });
  };

  // Valor da fatura fechada: soma das transações do ciclo fechado que NÃO foram pagas
  const getFaturaFechada = (cartao: Conta) => {
    const { fechada } = getFaturasInfo(cartao);
    const transacoesCiclo = getTransacoesCiclo(cartao.id, fechada.inicio, fechada.fim);
    return transacoesCiclo
      .filter(t => t.is_pago_executado !== true)
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  // Também verificar se há faturas anteriores não pagas (acumuladas)
  const getFaturasAnterioresNaoPagas = (cartao: Conta) => {
    const { fechada } = getFaturasInfo(cartao);
    // Todas as transações com data de compra ANTES do ciclo fechado atual que ainda não foram pagas
    return transacoes
      .filter(t => {
        if (t.conta_id !== cartao.id) return false;
        return t.data < fechada.inicio && t.is_pago_executado !== true;
      })
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  // Valor da fatura aberta (ciclo atual)
  const getFaturaAberta = (cartao: Conta) => {
    const { aberta } = getFaturasInfo(cartao);
    const transacoesCiclo = getTransacoesCiclo(cartao.id, aberta.inicio, aberta.fim);
    return transacoesCiclo.reduce((acc, t) => acc + Number(t.valor), 0);
  };

  // Saldo devedor total = todas as transações não pagas
  const getSaldoDevedor = (cartaoId: string) => {
    return transacoes
      .filter(t => t.conta_id === cartaoId && t.is_pago_executado !== true)
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  const handlePagarFatura = (cartao: Conta) => {
    const { fechada } = getFaturasInfo(cartao);
    const faturaFechada = getFaturaFechada(cartao);
    const faturasAnteriores = getFaturasAnterioresNaoPagas(cartao);
    const valorTotal = faturaFechada + faturasAnteriores;
    
    setFaturaModal({
      open: true,
      cartaoId: cartao.id,
      cartaoNome: cartao.nome_conta,
      valorFatura: Math.max(0, valorTotal),
      vencimentoFatura: format(fechada.vencimento, "yyyy-MM-dd"),
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cartões de Crédito</h1>
            <p className="text-muted-foreground">Acompanhe seus gastos e faturas</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/financas/contas">
              Gerenciar Cartões
            </Link>
          </Button>
        </div>

        {cartoes.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum cartão cadastrado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Cadastre seus cartões de crédito para acompanhar gastos e faturas
              </p>
              <Button asChild>
                <Link to="/financas/contas">Cadastrar Cartão</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cartoes.map((cartao) => {
              const faturasInfo = getFaturasInfo(cartao);
              const faturaFechada = getFaturaFechada(cartao);
              const faturasAnteriores = getFaturasAnterioresNaoPagas(cartao);
              const totalFechada = faturaFechada + faturasAnteriores;
              const faturaAberta = getFaturaAberta(cartao);
              const saldoDevedor = getSaldoDevedor(cartao.id);
              const limite = Number(cartao.limite) || 0;
              const percentualUsado = limite > 0 ? (Math.max(0, saldoDevedor) / limite) * 100 : 0;
              const disponivel = limite - Math.max(0, saldoDevedor);

              return (
                <Card key={cartao.id} className="shadow-card overflow-hidden">
                  <div className="h-2" style={{ backgroundColor: cartao.cor }} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${cartao.cor}20` }}
                        >
                          <CreditCard className="h-5 w-5" style={{ color: cartao.cor }} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{cartao.nome_conta}</CardTitle>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            Fecha dia {cartao.dia_fechamento} | Vence dia {cartao.dia_vencimento}
                          </div>
                        </div>
                      </div>
                      {percentualUsado > 80 && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Alto uso
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Fatura Fechada - Pronta para pagar */}
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-1">
                            <p className="text-xs text-muted-foreground">
                              Fatura Fechada ({faturasInfo.fechada.mesReferencia})
                            </p>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs text-xs">
                                  Compras de {format(new Date(faturasInfo.fechada.inicio), "dd/MM")} a {format(new Date(faturasInfo.fechada.fim), "dd/MM")}.
                                  Vencimento: {format(faturasInfo.fechada.vencimento, "dd/MM/yyyy")}.
                                  {faturasAnteriores > 0 && ` Inclui ${formatCurrency(faturasAnteriores)} de faturas anteriores não pagas.`}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <p className={`text-lg font-bold ${totalFechada > 0 ? "text-warning" : "text-success"}`}>
                            {formatCurrency(totalFechada)}
                          </p>
                          {faturasAnteriores > 0 && (
                            <p className="text-[10px] text-destructive">
                              Inclui {formatCurrency(faturasAnteriores)} de faturas anteriores
                            </p>
                          )}
                        </div>
                        {totalFechada > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 border-warning text-warning hover:bg-warning hover:text-warning-foreground"
                            onClick={() => handlePagarFatura(cartao)}
                          >
                            <Banknote className="h-4 w-4" />
                            Pagar
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Fatura Aberta (ciclo atual) */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Fatura Atual (em aberto)</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">
                                Compras de {format(new Date(faturasInfo.aberta.inicio), "dd/MM")} a {format(new Date(faturasInfo.aberta.fim), "dd/MM")}.
                                Esta fatura ainda não fechou.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <span className="font-medium text-foreground">
                          {formatCurrency(faturaAberta)}
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(percentualUsado, 100)} 
                        className="h-2"
                      />
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-muted-foreground">{percentualUsado.toFixed(1)}% usado</span>
                        <span className="text-muted-foreground">Limite: {formatCurrency(limite)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Disponível</p>
                        <p className={`text-lg font-bold ${disponivel >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(disponivel)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Saldo Devedor Total</p>
                        <p className="text-lg font-bold text-foreground">{formatCurrency(saldoDevedor)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <PagarFaturaModal
        open={faturaModal.open}
        onOpenChange={(open) => setFaturaModal((prev) => ({ ...prev, open }))}
        cartaoId={faturaModal.cartaoId}
        cartaoNome={faturaModal.cartaoNome}
        valorFatura={faturaModal.valorFatura}
        vencimentoFatura={faturaModal.vencimentoFatura}
        contasDisponiveis={todasContas}
      />
    </AppLayout>
  );
};

export default Cartoes;
