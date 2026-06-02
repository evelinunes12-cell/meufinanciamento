import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreditCard, Calendar, AlertTriangle, Banknote, Info, History, Lock, LockOpen, Zap, Check, MoreVertical, ArrowLeft, ArrowRight, Split } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { addDays, format, subMonths, addMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import PagarFaturaModal from "@/components/PagarFaturaModal";
import ParcelarFaturaModal from "@/components/ParcelarFaturaModal";
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
  mes_fatura_override: string | null;
}

// ==========================================
// Lógica de ciclo de fatura de cartão de crédito
// ==========================================

type ForceCloseState = Record<string, string>;

function getDateForCardDay(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(day, 1), lastDay));
}

function getNaturalClosedCycleEnd(cartao: Conta, hoje: Date = new Date()) {
  const diaFechamento = cartao.dia_fechamento || 1;
  const diaHoje = hoje.getDate();
  const mesHoje = hoje.getMonth();
  const anoHoje = hoje.getFullYear();
  const jaFechou = diaHoje >= diaFechamento;

  return getDateForCardDay(anoHoje, jaFechou ? mesHoje : mesHoje - 1, diaFechamento);
}

function getCurrentCycleEnd(cartao: Conta, hoje: Date = new Date()) {
  const diaFechamento = cartao.dia_fechamento || 1;
  return getDateForCardDay(hoje.getFullYear(), hoje.getMonth(), diaFechamento);
}

function getActiveForcedCycleEnd(cartao: Conta, state: ForceCloseState, hoje: Date = new Date()) {
  const forcedEnd = state[cartao.id];
  if (typeof forcedEnd !== "string") return null;

  const naturalEnd = format(getNaturalClosedCycleEnd(cartao, hoje), "yyyy-MM-dd");
  return forcedEnd > naturalEnd ? forcedEnd : null;
}

function getFaturasInfo(cartao: Conta, hoje: Date = new Date(), forcedCycleEnd?: string | null) {
  const diaFechamento = cartao.dia_fechamento || 1;
  const diaVencimento = cartao.dia_vencimento || 10;

  const naturalClosedEnd = getNaturalClosedCycleEnd(cartao, hoje);
  const forcedClosedEnd = forcedCycleEnd ? parseISO(forcedCycleEnd) : null;
  const fechadaFim = forcedClosedEnd && forcedCycleEnd > format(naturalClosedEnd, "yyyy-MM-dd")
    ? forcedClosedEnd
    : naturalClosedEnd;

  const fechadaAnteriorFim = getDateForCardDay(
    fechadaFim.getFullYear(),
    fechadaFim.getMonth() - 1,
    diaFechamento,
  );
  const fechadaInicio = addDays(fechadaAnteriorFim, 1);

  let fechadaVencimento = getDateForCardDay(
    fechadaFim.getFullYear(),
    fechadaFim.getMonth(),
    diaVencimento,
  );
  if (fechadaVencimento <= fechadaFim) {
    fechadaVencimento = getDateForCardDay(
      fechadaFim.getFullYear(),
      fechadaFim.getMonth() + 1,
      diaVencimento,
    );
  }

  const abertaInicio = addDays(fechadaFim, 1);
  const abertaFim = getDateForCardDay(
    fechadaFim.getFullYear(),
    fechadaFim.getMonth() + 1,
    diaFechamento,
  );

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

  for (let i = -1; i <= meses - 2; i++) {
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
      .select("id, conta_id, valor, tipo, data, data_pagamento, is_pago_executado, descricao, parcela_atual, parcelas_total, mes_fatura_override"),
    supabase.from("contas").select("*"),
  ]);

  return {
    cartoes: (cartoesRes.data || []) as Conta[],
    transacoes: (transacoesRes.data || []) as Transacao[],
    todasContas: (contasRes.data || []) as Conta[],
  };
}

const FORCE_CLOSE_KEY = "cartoes_force_close";

function getForceCloseState(): ForceCloseState {
  try {
    const parsed = JSON.parse(localStorage.getItem(FORCE_CLOSE_KEY) || "{}");
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "string" || typeof value === "boolean")
    ) as ForceCloseState;
  } catch {
    return {};
  }
}

function setForceCloseState(state: ForceCloseState) {
  localStorage.setItem(FORCE_CLOSE_KEY, JSON.stringify(state));
}

const Cartoes = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("faturas");
  const [forceClose, setForceClose] = useState<ForceCloseState>(getForceCloseState);
  const [faturaModal, setFaturaModal] = useState<{
    open: boolean;
    cartaoId: string;
    cartaoNome: string;
    valorFatura: number;
    vencimentoFatura: string;
    tipo: "fechada" | "aberta" | "antecipada";
    transacaoIds: string[];
    mesReferencia: string;
  }>({ open: false, cartaoId: "", cartaoNome: "", valorFatura: 0, vencimentoFatura: "", tipo: "fechada", transacaoIds: [], mesReferencia: "" });
  const [parcelarModal, setParcelarModal] = useState<{
    open: boolean;
    cartaoId: string;
    cartaoNome: string;
    cartaoFechamento: number;
    cartaoVencimento: number;
    valorFatura: number;
    vencimentoFatura: string;
    mesReferencia: string;
  }>({
    open: false,
    cartaoId: "",
    cartaoNome: "",
    cartaoFechamento: 1,
    cartaoVencimento: 10,
    valorFatura: 0,
    vencimentoFatura: "",
    mesReferencia: "",
  });

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

  const toggleForceClose = (cartao: Conta) => {
    setForceClose((prev) => {
      const next = { ...prev };
      const activeForcedEnd = getActiveForcedCycleEnd(cartao, prev);
      if (activeForcedEnd) {
        delete next[cartao.id];
      } else {
        next[cartao.id] = format(getCurrentCycleEnd(cartao), "yyyy-MM-dd");
      }
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
        mes_fatura_override: transacao.mes_fatura_override,
      },
      todasContas
    );
  };

  // Signed value: receita on a credit card (e.g. Crédito de Ajuste, estorno)
  // reduces the invoice total — negate it for any invoice math.
  const signedValue = (t: Transacao) =>
    t.tipo === "receita" ? -Number(t.valor) : Number(t.valor);

  const cents = (value: number) => Math.round(value * 100);
  const hasAmount = (value: number) => cents(value) > 0;
  const affectsInvoiceBalance = (t: Transacao) => t.tipo === "receita" || t.is_pago_executado !== true;

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
    const forcedCycleEnd = getActiveForcedCycleEnd(cartao, forceClose);
    const { fechada } = getFaturasInfo(cartao, new Date(), forcedCycleEnd);
    const transacoesCiclo = getTransacoesCiclo(cartao.id, fechada.inicio, fechada.fim);
    const total = transacoesCiclo
      .filter(affectsInvoiceBalance)
      .reduce((acc, t) => acc + signedValue(t), 0);
    return Math.max(0, total);
  };

  const getFaturasAnterioresNaoPagas = (cartao: Conta) => {
    const forcedCycleEnd = getActiveForcedCycleEnd(cartao, forceClose);
    const { fechada } = getFaturasInfo(cartao, new Date(), forcedCycleEnd);
    return transacoes
      .filter(t => {
        if (t.conta_id !== cartao.id) return false;
        const dataCompetencia = getDataCompetencia(t);
        return dataCompetencia < fechada.inicio && affectsInvoiceBalance(t);
      })
      .reduce((acc, t) => acc + signedValue(t), 0);
  };

  const getFaturaAberta = (cartao: Conta) => {
    const forcedCycleEnd = getActiveForcedCycleEnd(cartao, forceClose);
    const { aberta } = getFaturasInfo(cartao, new Date(), forcedCycleEnd);
    const transacoesCiclo = getTransacoesCiclo(cartao.id, aberta.inicio, aberta.fim);
    const total = transacoesCiclo
      .filter(t => t.tipo === "receita" || t.is_pago_executado !== true)
      .reduce((acc, t) => acc + signedValue(t), 0);
    return Math.max(0, total);
  };

  const getSaldoDevedor = (cartaoId: string) => {
    return transacoes
      .filter(t => t.conta_id === cartaoId && affectsInvoiceBalance(t))
      .reduce((acc, t) => Math.max(0, acc + signedValue(t)), 0);
  };

  // Detects whether a closed invoice has a "Crédito de Ajuste" — i.e. it was parceled.
  const faturaFoiParcelada = (cartao: Conta) => {
    const forcedCycleEnd = getActiveForcedCycleEnd(cartao, forceClose);
    const { fechada } = getFaturasInfo(cartao, new Date(), forcedCycleEnd);
    const ciclo = getTransacoesCiclo(cartao.id, fechada.inicio, fechada.fim);
    return ciclo.some(t => t.tipo === "receita" && (t.descricao || "").toLowerCase().includes("crédito de ajuste"));
  };

  const moverFatura = async (transacao: Transacao, direcao: "anterior" | "seguinte") => {
    // Build current invoice month-ref. If override exists, use it; else, derive from competência.
    const baseMesRef =
      transacao.mes_fatura_override ||
      format(parseISO(getDataCompetencia(transacao)), "yyyy-MM");
    const baseDate = parseISO(`${baseMesRef}-15`);
    const novoMesRef = format(
      addMonths(baseDate, direcao === "seguinte" ? 1 : -1),
      "yyyy-MM"
    );

    const { error } = await supabase
      .from("transacoes")
      .update({ mes_fatura_override: novoMesRef })
      .eq("id", transacao.id);

    if (error) {
      toast({ title: "Erro ao mover", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Transação movida",
      description: `Para ${format(parseISO(`${novoMesRef}-15`), "MMMM/yyyy", { locale: ptBR })}.`,
    });
    queryClient.invalidateQueries({ queryKey: ["cartoes"] });
    queryClient.invalidateQueries({ queryKey: ["transacoes"] });
  };


  const renderFaturaDetalhes = (transacoesCiclo: Transacao[], emptyText: string) => {
    if (transacoesCiclo.length === 0) {
      return <p className="text-xs text-muted-foreground py-2">{emptyText}</p>;
    }

    return (
      <div className="space-y-2 pt-1">
        {transacoesCiclo.map((transacao) => {
          const isReceita = transacao.tipo === "receita";
          return (
            <div
              key={transacao.id}
              className="flex items-center justify-between gap-2 text-xs border-b border-border/60 pb-2 last:border-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">
                  {transacao.descricao || "Sem descrição"}
                </p>
                <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
                  <span>{format(new Date(transacao.data), "dd/MM")}</span>
                  {transacao.parcelas_total && transacao.parcela_atual && transacao.parcelas_total > 1 && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {transacao.parcela_atual}/{transacao.parcelas_total}
                    </Badge>
                  )}
                  {transacao.mes_fatura_override && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/40 text-primary">
                      Movida
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <p className={`font-semibold whitespace-nowrap ${isReceita ? "text-success" : "text-foreground"}`}>
                  {isReceita ? "−" : ""}{formatCurrency(Number(transacao.valor))}
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Mais ações"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => moverFatura(transacao, "anterior")}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Mover para fatura anterior
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => moverFatura(transacao, "seguinte")}>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Mover para fatura seguinte
                    </DropdownMenuItem>
                    {transacao.mes_fatura_override && (
                      <DropdownMenuItem
                        onClick={async () => {
                          const { error } = await supabase
                            .from("transacoes")
                            .update({ mes_fatura_override: null })
                            .eq("id", transacao.id);
                          if (error) {
                            toast({ title: "Erro", description: error.message, variant: "destructive" });
                            return;
                          }
                          toast({ title: "Movimentação desfeita" });
                          queryClient.invalidateQueries({ queryKey: ["cartoes"] });
                          queryClient.invalidateQueries({ queryKey: ["transacoes"] });
                        }}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Restaurar fatura original
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const handlePagarFatura = (cartao: Conta) => {
    const forcedCycleEnd = getActiveForcedCycleEnd(cartao, forceClose);
    const { fechada } = getFaturasInfo(cartao, new Date(), forcedCycleEnd);
    const faturaFechada = getFaturaFechada(cartao);
    const faturasAnteriores = getFaturasAnterioresNaoPagas(cartao);
    const valorTotal = faturaFechada + faturasAnteriores;

    // Collect every pending row (closed cycle + earlier unpaid) so the
    // modal can mark exactly these as executed.
    const idsCiclo = getTransacoesCiclo(cartao.id, fechada.inicio, fechada.fim)
      .filter((t) => t.tipo === "despesa" && t.is_pago_executado !== true)
      .map((t) => t.id);
    const idsAnteriores = transacoes
      .filter((t) => {
        if (t.conta_id !== cartao.id) return false;
        const dataCompetencia = getDataCompetencia(t);
        return dataCompetencia < fechada.inicio && t.tipo === "despesa" && t.is_pago_executado !== true;
      })
      .map((t) => t.id);

    setFaturaModal({
      open: true,
      cartaoId: cartao.id,
      cartaoNome: cartao.nome_conta,
      valorFatura: Math.max(0, valorTotal),
      vencimentoFatura: format(fechada.vencimento, "yyyy-MM-dd"),
      tipo: "fechada",
      transacaoIds: [...idsCiclo, ...idsAnteriores],
      mesReferencia: format(parseISO(fechada.fim), "yyyy-MM"),
    });
  };

  const handleFecharEPagarAberta = (cartao: Conta) => {
    const forcedCycleEnd = format(getCurrentCycleEnd(cartao), "yyyy-MM-dd");
    if (!getActiveForcedCycleEnd(cartao, forceClose)) {
      setForceClose((prev) => {
        const next = { ...prev, [cartao.id]: forcedCycleEnd };
        setForceCloseState(next);
        return next;
      });
    }
    const { fechada } = getFaturasInfo(cartao, new Date(), forcedCycleEnd);
    const transacoesCiclo = getTransacoesCiclo(cartao.id, fechada.inicio, fechada.fim);
    const pendentesCiclo = transacoesCiclo.filter((t) => t.tipo === "despesa" && t.is_pago_executado !== true);
    const valor = pendentesCiclo.reduce((acc, t) => acc + signedValue(t), 0);
    const faturasAnteriores = transacoes
      .filter((t) => {
        if (t.conta_id !== cartao.id) return false;
        const dataCompetencia = getDataCompetencia(t);
        return dataCompetencia < fechada.inicio && affectsInvoiceBalance(t);
      })
      .reduce((acc, t) => acc + signedValue(t), 0);
    const idsAnteriores = transacoes
      .filter((t) => {
        if (t.conta_id !== cartao.id) return false;
        const dataCompetencia = getDataCompetencia(t);
        return dataCompetencia < fechada.inicio && t.tipo === "despesa" && t.is_pago_executado !== true;
      })
      .map((t) => t.id);

    setFaturaModal({
      open: true,
      cartaoId: cartao.id,
      cartaoNome: cartao.nome_conta,
      valorFatura: Math.max(0, valor + faturasAnteriores),
      vencimentoFatura: format(fechada.vencimento, "yyyy-MM-dd"),
      tipo: "fechada",
      transacaoIds: [...pendentesCiclo.map((t) => t.id), ...idsAnteriores],
      mesReferencia: format(parseISO(fechada.fim), "yyyy-MM"),
    });
  };

  const handleAnteciparFatura = (cartao: Conta) => {
    const forcedCycleEnd = getActiveForcedCycleEnd(cartao, forceClose);
    const { aberta } = getFaturasInfo(cartao, new Date(), forcedCycleEnd);
    const valorAberta = getFaturaAberta(cartao);

    // Real due date for the open invoice = one month after the closed
    // invoice's due date (same dia_vencimento, next month).
    const diaVencimento = cartao.dia_vencimento || 10;
    const fimAberta = parseISO(aberta.fim);
    const vencimentoAberta = new Date(fimAberta.getFullYear(), fimAberta.getMonth(), diaVencimento);
    if (vencimentoAberta <= fimAberta) {
      vencimentoAberta.setMonth(vencimentoAberta.getMonth() + 1);
    }

    const idsCiclo = getTransacoesCiclo(cartao.id, aberta.inicio, aberta.fim)
      .filter((t) => t.tipo === "despesa" && t.is_pago_executado !== true)
      .map((t) => t.id);

    setFaturaModal({
      open: true,
      cartaoId: cartao.id,
      cartaoNome: cartao.nome_conta,
      valorFatura: Math.max(0, valorAberta),
      vencimentoFatura: format(vencimentoAberta, "yyyy-MM-dd"),
      tipo: "antecipada",
      transacaoIds: idsCiclo,
      mesReferencia: format(parseISO(aberta.fim), "yyyy-MM"),
    });
  };

  // Calcula histórico de faturas para um cartão
  const getHistorico = (cartao: Conta) => {
    const ciclos = getHistoricoCiclos(cartao, 12);
    return ciclos.map(ciclo => {
      const transacoesCiclo = getTransacoesCiclo(cartao.id, ciclo.inicio, ciclo.fim);
      const valorFechado = transacoesCiclo
        .filter(t => t.tipo === "despesa")
        .reduce((acc, t) => acc + Number(t.valor), 0);
      const pagamentosFatura = transacoesCiclo
        .filter(t => t.tipo === "receita")
        .reduce((acc, t) => acc + Number(t.valor), 0);
      const valorPago = Math.max(0, Math.min(valorFechado, pagamentosFatura));
      const despesasPendentes = transacoesCiclo
        .filter(t => t.tipo === "despesa" && t.is_pago_executado !== true)
        .reduce((acc, t) => acc + Number(t.valor), 0);
      const valorPendente = Math.max(0, despesasPendentes - pagamentosFatura);
      const estaPaga = cents(valorPendente) <= 0;
      const pagamentoParcial = !estaPaga && cents(valorPago) > 0;

      return {
        mesReferencia: ciclo.mesReferencia,
        vencimento: ciclo.vencimento,
        valorFechado,
        valorPago,
        valorPendente,
        estaPaga,
        pagamentoParcial,
        qtdTransacoes: transacoesCiclo.length,
      };
    }).filter(h => h.qtdTransacoes > 0 || h.valorFechado > 0);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <PageLoadingSkeleton type="cards" title="Cartões de Crédito" />
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
                  const forcedCycleEnd = getActiveForcedCycleEnd(cartao, forceClose);
                  const isForced = !!forcedCycleEnd;
                  const diaHoje = new Date().getDate();
                  const diaFechamento = cartao.dia_fechamento || 1;
                  const jaFechouNaturalmente = diaHoje >= diaFechamento;
                  const faturasInfo = getFaturasInfo(cartao, new Date(), forcedCycleEnd);
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
                                onCheckedChange={() => toggleForceClose(cartao)}
                              />
                            </div>
                          </div>
                        )}

                        {/* Fatura Fechada */}
                        {(() => {
                          const pendentes = transacoesFechada.filter(t => t.tipo === "despesa" && t.is_pago_executado !== true);
                          const todasPagas = transacoesFechada.length > 0 && pendentes.length === 0 && !hasAmount(faturasAnteriores) && !hasAmount(totalFechada);
                          const semTransacoes = transacoesFechada.length === 0 && faturasAnteriores === 0;
                          const isPaga = todasPagas || semTransacoes;
                          const foiParcelada = faturaFoiParcelada(cartao);

                          return (
                            <div className={`p-3 rounded-lg border ${isPaga ? "bg-success/10 border-success/30" : "bg-warning/10 border-warning/30"}`}>
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs text-muted-foreground">
                                      Fatura Fechada ({faturasInfo.fechada.mesReferencia})
                                    </p>
                                    {isForced && !jaFechouNaturalmente && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-warning text-warning">
                                        Manual
                                      </Badge>
                                    )}
                                    <Badge variant={isPaga ? "outline" : "destructive"} className={`text-[9px] px-1.5 py-0 ${isPaga ? "border-success text-success" : ""}`}>
                                      {isPaga ? "✓ Paga" : "Pendente"}
                                    </Badge>
                                    {foiParcelada && (
                                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary text-primary">
                                        <Split className="h-2.5 w-2.5 mr-0.5" />
                                        Fatura Parcelada
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
                                  <p className={`text-lg font-bold ${isPaga ? "text-success" : hasAmount(totalFechada) ? "text-warning" : "text-success"}`}>
                                    {formatCurrency(totalFechada)}
                                  </p>
                                  {faturasAnteriores > 0 && (
                                    <p className="text-[10px] text-destructive">
                                      Inclui {formatCurrency(faturasAnteriores)} de faturas anteriores
                                    </p>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  {!isPaga && hasAmount(totalFechada) && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1 border-warning text-warning hover:bg-warning hover:text-warning-foreground"
                                        onClick={() => handlePagarFatura(cartao)}
                                      >
                                        <Banknote className="h-4 w-4" />
                                        Pagar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1 border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground"
                                        onClick={() => {
                                          setParcelarModal({
                                            open: true,
                                            cartaoId: cartao.id,
                                            cartaoNome: cartao.nome_conta,
                                            cartaoFechamento: cartao.dia_fechamento || 1,
                                            cartaoVencimento: cartao.dia_vencimento || 10,
                                            valorFatura: Math.max(0, totalFechada),
                                            vencimentoFatura: format(faturasInfo.fechada.vencimento, "yyyy-MM-dd"),
                                            mesReferencia: format(parseISO(faturasInfo.fechada.fim), "yyyy-MM"),
                                          });
                                        }}
                                      >
                                        <Split className="h-4 w-4" />
                                        Parcelar
                                      </Button>
                                    </>
                                  )}
                                  {!isPaga && !hasAmount(totalFechada) && pendentes.length > 0 && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1 border-success text-success hover:bg-success hover:text-success-foreground"
                                      onClick={() => {
                                        const dataHoje = format(new Date(), "yyyy-MM-dd");
                                        Promise.all(
                                          pendentes.map(t =>
                                            supabase
                                              .from("transacoes")
                                              .update({ is_pago_executado: true, data_execucao_pagamento: dataHoje })
                                              .eq("id", t.id)
                                          )
                                        ).then(() => {
                                          toast({ title: "Fatura marcada como paga", description: `${pendentes.length} transação(ões) quitada(s).` });
                                          queryClient.invalidateQueries({ queryKey: ["cartoes"] });
                                          queryClient.invalidateQueries({ queryKey: ["transacoes"] });
                                          queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
                                        });
                                      }}
                                    >
                                      <Check className="h-4 w-4" />
                                      Confirmar Paga
                                    </Button>
                                  )}
                                </div>
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
                          );
                        })()}

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
                                      aria-label="Fechar e pagar fatura"
                                    >
                                      <Lock className="h-3 w-3" />
                                      <span className="hidden sm:inline">Fechar e Pagar</span>
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
                                      aria-label="Antecipar fatura"
                                    >
                                      <Zap className="h-3 w-3" />
                                      <span className="hidden sm:inline">Antecipar</span>
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
                                      {item.estaPaga ? (
                                        <Badge className="bg-success/20 text-success border-success/30 hover:bg-success/30">
                                          Paga
                                        </Badge>
                                      ) : item.pagamentoParcial ? (
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
        transacaoIds={faturaModal.transacaoIds}
        valorQuitacao={faturaModal.valorFatura}
        mesReferencia={faturaModal.mesReferencia}
      />

      <ParcelarFaturaModal
        open={parcelarModal.open}
        onOpenChange={(open) => setParcelarModal((prev) => ({ ...prev, open }))}
        cartaoId={parcelarModal.cartaoId}
        cartaoNome={parcelarModal.cartaoNome}
        cartaoFechamento={parcelarModal.cartaoFechamento}
        cartaoVencimento={parcelarModal.cartaoVencimento}
        valorFatura={parcelarModal.valorFatura}
        vencimentoFatura={parcelarModal.vencimentoFatura}
        mesReferencia={parcelarModal.mesReferencia}
      />
    </AppLayout>
  );
};

export default Cartoes;
