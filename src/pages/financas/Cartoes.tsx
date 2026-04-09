import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, Calendar, AlertTriangle, Banknote, Info, History, Lock, LockOpen, Zap, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import PagarFaturaModal from "@/components/PagarFaturaModal";
import { getDataCompetenciaTransacao } from "@/lib/transactions";

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
  data: string;
  data_pagamento: string | null;
  is_pago_executado: boolean | null;
  descricao: string | null;
  parcela_atual: number | null;
  parcelas_total: number | null;
}

// ==========================================
// Lógica de ciclo de fatura de cartão de crédito
// ==========================================

function getFaturasInfo(cartao: Conta, hoje: Date = new Date(), forceClose = false) {
  const diaFechamento = cartao.dia_fechamento || 1;
  const diaVencimento = cartao.dia_vencimento || 10;
  const diaHoje = hoje.getDate();
  const mesHoje = hoje.getMonth();
  const anoHoje = hoje.getFullYear();

  // Se forceClose é true, tratamos como se já tivesse fechado
  const jaFechou = forceClose ? true : diaHoje >= diaFechamento;

  let abertaInicio: Date;
  let abertaFim: Date;

  if (jaFechou) {
    abertaInicio = new Date(anoHoje, mesHoje, diaFechamento + 1);
    abertaFim = new Date(anoHoje, mesHoje + 1, diaFechamento);
  } else {
    abertaInicio = new Date(anoHoje, mesHoje - 1, diaFechamento + 1);
    abertaFim = new Date(anoHoje, mesHoje, diaFechamento);
  }

  let fechadaFim: Date;
  let fechadaInicio: Date;
  let fechadaVencimento: Date;

  if (jaFechou) {
    fechadaFim = new Date(anoHoje, mesHoje, diaFechamento);
    fechadaInicio = new Date(anoHoje, mesHoje - 1, diaFechamento + 1);
    fechadaVencimento = new Date(anoHoje, mesHoje, diaVencimento);
  } else {
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

/**
 * Gera ciclos de fatura retroativos para histórico
 */
function getHistoricoCiclos(cartao: Conta, meses: number = 12) {
  const diaFechamento = cartao.dia_fechamento || 1;
  const diaVencimento = cartao.dia_vencimento || 10;
  const hoje = new Date();
  const ciclos: Array<{
    mesReferencia: string;
    inicio: string;
    fim: string;
    vencimento: Date;
  }> = [];

  for (let i = 1; i <= meses; i++) {
    const refDate = subMonths(hoje, i);
    const mes = refDate.getMonth();
    const ano = refDate.getFullYear();

    // O ciclo que fecha nesse mês
    const fechaFim = new Date(ano, mes, diaFechamento);
    const fechaInicio = new Date(ano, mes - 1, diaFechamento + 1);
    const vencimento = new Date(ano, mes, diaVencimento);

    ciclos.push({
      mesReferencia: format(fechaFim, "MMMM/yyyy", { locale: ptBR }),
      inicio: format(fechaInicio, "yyyy-MM-dd"),
      fim: format(fechaFim, "yyyy-MM-dd"),
      vencimento,
    });
  }

  return ciclos;
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

const FORCE_CLOSE_KEY = "cartoes_force_close";

function getForceCloseState(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FORCE_CLOSE_KEY) || "{}");
  } catch {
    return {};
  }
}

function setForceCloseState(state: Record<string, boolean>) {
  localStorage.setItem(FORCE_CLOSE_KEY, JSON.stringify(state));
}

const Cartoes = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("faturas");
  const [forceClose, setForceClose] = useState<Record<string, boolean>>(getForceCloseState);
  const [faturaModal, setFaturaModal] = useState<{
    open: boolean;
    cartaoId: string;
    cartaoNome: string;
    valorFatura: number;
    vencimentoFatura: string;
    tipo: "fechada" | "aberta" | "antecipada";
  }>({ open: false, cartaoId: "", cartaoNome: "", valorFatura: 0, vencimentoFatura: "", tipo: "fechada" });

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

  const toggleForceClose = (cartaoId: string) => {
    setForceClose((prev) => {
      const next = { ...prev, [cartaoId]: !prev[cartaoId] };
      setForceCloseState(next);
      return next;
    });
  };

  const getDataCompetencia = (transacao: Transacao) => {
    return getDataCompetenciaTransacao(
      {
        data: transacao.data,
        data_pagamento: transacao.data_pagamento,
        conta_id: transacao.conta_id,
        parcela_atual: transacao.parcela_atual,
      },
      todasContas
    );
  };

  const getTransacoesCiclo = (cartaoId: string, inicio: string, fim: string) => {
    return transacoes
      .filter(t => {
        if (t.conta_id !== cartaoId) return false;
        const dataCompetencia = getDataCompetencia(t);
        return dataCompetencia >= inicio && dataCompetencia <= fim;
      })
      .sort((a, b) => {
        const dataCompetenciaA = getDataCompetencia(a);
        const dataCompetenciaB = getDataCompetencia(b);

        if (dataCompetenciaA !== dataCompetenciaB) {
          return dataCompetenciaB.localeCompare(dataCompetenciaA);
        }

        return b.data.localeCompare(a.data);
      });
  };

const getFaturaFechada = (cartao: Conta) => {
    const isForced = forceClose[cartao.id] || false;
    const { fechada } = getFaturasInfo(cartao, new Date(), isForced);
    const transacoesCiclo = getTransacoesCiclo(cartao.id, fechada.inicio, fechada.fim);
    return transacoesCiclo
      .filter(t => t.is_pago_executado !== true)
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  const getFaturasAnterioresNaoPagas = (cartao: Conta) => {
    const isForced = forceClose[cartao.id] || false;
    const { fechada } = getFaturasInfo(cartao, new Date(), isForced);
    return transacoes
      .filter(t => {
        if (t.conta_id !== cartao.id) return false;
        const dataCompetencia = getDataCompetencia(t);
        return dataCompetencia < fechada.inicio && t.is_pago_executado !== true;
      })
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  const getFaturaAberta = (cartao: Conta) => {
    const isForced = forceClose[cartao.id] || false;
    const { aberta } = getFaturasInfo(cartao, new Date(), isForced);
    const transacoesCiclo = getTransacoesCiclo(cartao.id, aberta.inicio, aberta.fim);
    return transacoesCiclo.reduce((acc, t) => acc + Number(t.valor), 0);
  };

  const getSaldoDevedor = (cartaoId: string) => {
    return transacoes
      .filter(t => t.conta_id === cartaoId && t.is_pago_executado !== true)
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  const renderFaturaDetalhes = (transacoesCiclo: Transacao[], emptyText: string) => {
    if (transacoesCiclo.length === 0) {
      return <p className="text-xs text-muted-foreground py-2">{emptyText}</p>;
    }

    return (
      <div className="space-y-2 pt-1">
        {transacoesCiclo.map((transacao) => (
          <div
            key={transacao.id}
            className="flex items-center justify-between gap-2 text-xs border-b border-border/60 pb-2 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">
                {transacao.descricao || "Sem descrição"}
              </p>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{format(new Date(transacao.data), "dd/MM")}</span>
                {transacao.parcelas_total && transacao.parcela_atual && transacao.parcelas_total > 1 && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {transacao.parcela_atual}/{transacao.parcelas_total}
                  </Badge>
                )}
              </div>
            </div>
            <p className="font-semibold text-foreground whitespace-nowrap">
              {formatCurrency(Number(transacao.valor))}
            </p>
          </div>
        ))}
      </div>
    );
  };

  const handlePagarFatura = (cartao: Conta) => {
    const isForced = forceClose[cartao.id] || false;
    const { fechada } = getFaturasInfo(cartao, new Date(), isForced);
    const faturaFechada = getFaturaFechada(cartao);
    const faturasAnteriores = getFaturasAnterioresNaoPagas(cartao);
    const valorTotal = faturaFechada + faturasAnteriores;
    
    setFaturaModal({
      open: true,
      cartaoId: cartao.id,
      cartaoNome: cartao.nome_conta,
      valorFatura: Math.max(0, valorTotal),
      vencimentoFatura: format(fechada.vencimento, "yyyy-MM-dd"),
      tipo: "fechada",
    });
  };

  const handleFecharEPagarAberta = (cartao: Conta) => {
    // Force close the invoice first
    if (!forceClose[cartao.id]) {
      toggleForceClose(cartao.id);
    }
    // After force close, the "aberta" becomes "fechada" with different dates
    // So we recalculate with forceClose = true
    const { fechada } = getFaturasInfo(cartao, new Date(), true);
    const transacoesCiclo = getTransacoesCiclo(cartao.id, fechada.inicio, fechada.fim);
    const valor = transacoesCiclo
      .filter(t => t.is_pago_executado !== true)
      .reduce((acc, t) => acc + Number(t.valor), 0);
    const faturasAnteriores = getFaturasAnterioresNaoPagas(cartao);
    
    setFaturaModal({
      open: true,
      cartaoId: cartao.id,
      cartaoNome: cartao.nome_conta,
      valorFatura: Math.max(0, valor + faturasAnteriores),
      vencimentoFatura: format(fechada.vencimento, "yyyy-MM-dd"),
      tipo: "fechada",
    });
  };

  const handleAnteciparFatura = (cartao: Conta) => {
    const isForced = forceClose[cartao.id] || false;
    const { aberta } = getFaturasInfo(cartao, new Date(), isForced);
    const valorAberta = getFaturaAberta(cartao);
    
    setFaturaModal({
      open: true,
      cartaoId: cartao.id,
      cartaoNome: cartao.nome_conta,
      valorFatura: Math.max(0, valorAberta),
      vencimentoFatura: format(new Date(aberta.fim), "yyyy-MM-dd"),
      tipo: "antecipada",
    });
  };

  // Calcula histórico de faturas para um cartão
  const getHistorico = (cartao: Conta) => {
    const ciclos = getHistoricoCiclos(cartao, 12);
    return ciclos.map(ciclo => {
      const transacoesCiclo = getTransacoesCiclo(cartao.id, ciclo.inicio, ciclo.fim);
      const valorFechado = transacoesCiclo.reduce((acc, t) => acc + Number(t.valor), 0);
      const valorPago = transacoesCiclo
        .filter(t => t.is_pago_executado === true)
        .reduce((acc, t) => acc + Number(t.valor), 0);
      const valorPendente = transacoesCiclo
        .filter(t => t.is_pago_executado !== true)
        .reduce((acc, t) => acc + Number(t.valor), 0);

      return {
        mesReferencia: ciclo.mesReferencia,
        vencimento: ciclo.vencimento,
        valorFechado,
        valorPago,
        valorPendente,
        qtdTransacoes: transacoesCiclo.length,
      };
    }).filter(h => h.qtdTransacoes > 0 || h.valorFechado > 0);
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
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="faturas" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Faturas
              </TabsTrigger>
              <TabsTrigger value="historico" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Histórico
              </TabsTrigger>
            </TabsList>

            <TabsContent value="faturas" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {cartoes.map((cartao) => {
                  const isForced = forceClose[cartao.id] || false;
                  const diaHoje = new Date().getDate();
                  const diaFechamento = cartao.dia_fechamento || 1;
                  const jaFechouNaturalmente = diaHoje >= diaFechamento;
                  const faturasInfo = getFaturasInfo(cartao, new Date(), isForced);
                  const transacoesFechada = getTransacoesCiclo(cartao.id, faturasInfo.fechada.inicio, faturasInfo.fechada.fim);
                  const transacoesAberta = getTransacoesCiclo(cartao.id, faturasInfo.aberta.inicio, faturasInfo.aberta.fim);
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
                        {/* Toggle forçar fechamento - só mostra se a fatura ainda não fechou naturalmente */}
                        {!jaFechouNaturalmente && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border">
                            <div className="flex items-center gap-2">
                              {isForced ? (
                                <Lock className="h-4 w-4 text-warning" />
                              ) : (
                                <LockOpen className="h-4 w-4 text-muted-foreground" />
                              )}
                              <div>
                                <p className="text-xs font-medium text-foreground">
                                  {isForced ? "Fatura marcada como fechada" : "Fatura ainda aberta"}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  Fechamento automático no dia {diaFechamento}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">
                                {isForced ? "Fechada" : "Aberta"}
                              </span>
                              <Switch
                                checked={isForced}
                                onCheckedChange={() => toggleForceClose(cartao.id)}
                              />
                            </div>
                          </div>
                        )}

                        {/* Fatura Fechada */}
                        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="flex items-center gap-1">
                                <p className="text-xs text-muted-foreground">
                                  Fatura Fechada ({faturasInfo.fechada.mesReferencia})
                                </p>
                                {isForced && !jaFechouNaturalmente && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-warning text-warning">
                                    Manual
                                  </Badge>
                                )}
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
                            {totalFechada > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 border-warning text-warning hover:bg-warning hover:text-warning-foreground"
                                onClick={() => handlePagarFatura(cartao)}
                              >
                                <Banknote className="h-4 w-4" />
                                Pagar
                              </Button>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1 border-success text-success hover:bg-success hover:text-success-foreground"
                                    onClick={() => {
                                      // Mark all credit transactions in this closed cycle as paid
                                      const isForced = forceClose[cartao.id] || false;
                                      const { fechada } = getFaturasInfo(cartao, new Date(), isForced);
                                      const transacoesCiclo = getTransacoesCiclo(cartao.id, fechada.inicio, fechada.fim);
                                      const pendentes = transacoesCiclo.filter(t => t.is_pago_executado !== true);
                                      
                                      if (pendentes.length === 0) {
                                        // No pending transactions, just show success
                                        const { toast } = require("@/hooks/use-toast");
                                        toast({ title: "Fatura já está quitada", description: "Não há transações pendentes nesta fatura." });
                                        return;
                                      }
                                      
                                      const dataHoje = format(new Date(), "yyyy-MM-dd");
                                      Promise.all(
                                        pendentes.map(t =>
                                          supabase
                                            .from("transacoes")
                                            .update({ is_pago_executado: true, data_execucao_pagamento: dataHoje })
                                            .eq("id", t.id)
                                        )
                                      ).then(() => {
                                        const { toast } = require("@/hooks/use-toast");
                                        toast({ title: "Fatura marcada como paga", description: `${pendentes.length} transação(ões) quitada(s).` });
                                        const { useQueryClient } = require("@tanstack/react-query");
                                      });
                                    }}
                                  >
                                    <Check className="h-4 w-4" />
                                    Paga
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Marcar fatura R$ 0,00 como paga</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <Accordion type="single" collapsible className="mt-2">
                            <AccordionItem value="detalhes-fatura-fechada" className="border-0">
                              <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:no-underline">
                                Ver detalhes da fatura fechada
                              </AccordionTrigger>
                              <AccordionContent>
                                {renderFaturaDetalhes(
                                  transacoesFechada,
                                  "Nenhuma transação encontrada nesta fatura fechada.",
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>

                        {/* Fatura Aberta (ciclo atual) */}
                        <div className="p-3 rounded-lg bg-muted/30 border border-border">
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">Fatura Atual (em aberto)</span>
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
                              <p className="text-lg font-bold text-foreground">
                                {formatCurrency(faturaAberta)}
                              </p>
                            </div>
                            {faturaAberta > 0 && (
                              <div className="flex gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1 text-xs"
                                      onClick={() => handleFecharEPagarAberta(cartao)}
                                    >
                                      <Lock className="h-3 w-3" />
                                      Fechar e Pagar
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs text-xs">Fecha a fatura atual e abre o pagamento</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1 text-xs border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground"
                                      onClick={() => handleAnteciparFatura(cartao)}
                                    >
                                      <Zap className="h-3 w-3" />
                                      Antecipar
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs text-xs">Pagar a fatura antes do fechamento</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            )}
                          </div>
                          <Progress 
                            value={Math.min(percentualUsado, 100)} 
                            className="h-2 mt-2"
                          />
                          <div className="flex justify-between text-xs mt-1">
                            <span className="text-muted-foreground">{percentualUsado.toFixed(1)}% usado</span>
                            <span className="text-muted-foreground">Limite: {formatCurrency(limite)}</span>
                          </div>
                          <Accordion type="single" collapsible className="mt-2">
                            <AccordionItem value="detalhes-fatura-aberta" className="border-0">
                              <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:no-underline">
                                Ver detalhes da fatura atual
                              </AccordionTrigger>
                              <AccordionContent>
                                {renderFaturaDetalhes(
                                  transacoesAberta,
                                  "Nenhuma transação encontrada na fatura em aberto.",
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
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
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              <div className="space-y-6">
                {cartoes.map((cartao) => {
                  const historico = getHistorico(cartao);

                  return (
                    <Card key={cartao.id} className="shadow-card overflow-hidden">
                      <div className="h-2" style={{ backgroundColor: cartao.cor }} />
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div 
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: `${cartao.cor}20` }}
                          >
                            <CreditCard className="h-5 w-5" style={{ color: cartao.cor }} />
                          </div>
                          <CardTitle className="text-lg">{cartao.nome_conta}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {historico.length === 0 ? (
                          <div className="text-center py-8">
                            <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-muted-foreground text-sm">Nenhum histórico de fatura encontrado</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Mês</TableHead>
                                  <TableHead>Vencimento</TableHead>
                                  <TableHead className="text-right">Valor Fatura</TableHead>
                                  <TableHead className="text-right">Valor Pago</TableHead>
                                  <TableHead className="text-right">Pendente</TableHead>
                                  <TableHead className="text-center">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {historico.map((item) => (
                                  <TableRow key={item.mesReferencia}>
                                    <TableCell className="font-medium capitalize">
                                      {item.mesReferencia}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {format(item.vencimento, "dd/MM/yyyy")}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      {formatCurrency(item.valorFechado)}
                                    </TableCell>
                                    <TableCell className="text-right text-success">
                                      {formatCurrency(item.valorPago)}
                                    </TableCell>
                                    <TableCell className={`text-right ${item.valorPendente > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                      {formatCurrency(item.valorPendente)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {item.valorPendente <= 0 ? (
                                        <Badge className="bg-success/20 text-success border-success/30 hover:bg-success/30">
                                          Paga
                                        </Badge>
                                      ) : item.valorPago > 0 ? (
                                        <Badge variant="outline" className="border-warning text-warning">
                                          Parcial
                                        </Badge>
                                      ) : (
                                        <Badge variant="destructive">
                                          Pendente
                                        </Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <PagarFaturaModal
        open={faturaModal.open}
        onOpenChange={(open) => setFaturaModal((prev) => ({ ...prev, open }))}
        cartaoId={faturaModal.cartaoId}
        cartaoNome={faturaModal.cartaoNome}
        valorFatura={faturaModal.valorFatura}
        vencimentoFatura={faturaModal.vencimentoFatura}
        contasDisponiveis={todasContas.filter(c => c.tipo !== "credito")}
      />
    </AppLayout>
  );
};

export default Cartoes;
