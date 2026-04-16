/**
 * Centralized transaction utilities
 * Provides unified rules for transaction status and balance calculations
 */

import { addMonths, endOfMonth, startOfMonth, subMonths, parseISO, isBefore, isAfter, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { calculateCardDueDate, calculateInstallmentDueDate } from "@/lib/calculations";

// ==========================================
// Fixed Recurrence (Unlimited Subscriptions)
// ==========================================

/**
 * Window in months generated upfront for a "fixa" (unlimited) recurrence.
 * The series is later extended via extendFixaSeries when the user gets close
 * to the end of the window so it always feels unlimited.
 */
export const FIXA_RECURRENCE_WINDOW_MONTHS = 24;

/**
 * Threshold (in months) below which a series is auto-extended.
 * If the latest child of a fixa series is less than this many months ahead
 * of "today", we top up to FIXA_RECURRENCE_WINDOW_MONTHS again.
 */
export const FIXA_RECURRENCE_EXTEND_THRESHOLD_MONTHS = 6;

interface BuildFixaRowsParams {
  user_id: string;
  conta_id: string;
  categoria_id: string | null;
  valor: number;
  tipo: string;
  baseDate: Date;
  forma_pagamento: string;
  descricao: string | null;
  // Credit card support (only used when isCreditCard === true)
  isCreditCard: boolean;
  cardClosingDay?: number;
  cardDueDay?: number;
  // How many months of rows to produce (defaults to FIXA_RECURRENCE_WINDOW_MONTHS)
  months?: number;
  // Index offset (used by extendFixaSeries to continue from existing rows)
  startOffset?: number;
}

interface FixaRow {
  user_id: string;
  conta_id: string;
  categoria_id: string | null;
  valor: number;
  tipo: string;
  data: string;
  data_pagamento: string | null;
  forma_pagamento: string;
  recorrencia: string;
  descricao: string | null;
  is_pago_executado: boolean;
  parcela_atual: number;
  parcelas_total: null;
}

/**
 * Builds an array of monthly transaction rows for a "fixa" recurrence.
 * - Non credit-card: each row has data = baseDate + iMonths, data_pagamento = null,
 *   is_pago_executado = false (must be confirmed by the user every month).
 * - Credit card: each row keeps data = baseDate (purchase date is fixed for the
 *   fixed monthly charge), data_pagamento = invoice due date for that cycle,
 *   is_pago_executado = false (paid via invoice).
 */
export function buildFixaRecurrenceRows(params: BuildFixaRowsParams): FixaRow[] {
  const months = params.months ?? FIXA_RECURRENCE_WINDOW_MONTHS;
  const startOffset = params.startOffset ?? 0;
  const rows: FixaRow[] = [];

  const baseCardDueDate = params.isCreditCard && params.cardClosingDay && params.cardDueDay
    ? calculateCardDueDate(params.baseDate, params.cardClosingDay, params.cardDueDay)
    : null;

  for (let i = 0; i < months; i++) {
    const indexInSeries = startOffset + i;
    const occurrenceDate = addMonths(params.baseDate, indexInSeries);

    let data: string;
    let data_pagamento: string | null = null;

    if (params.isCreditCard && baseCardDueDate && params.cardDueDay) {
      // Keep purchase date fixed; only the invoice due date moves forward
      data = format(occurrenceDate, "yyyy-MM-dd");
      data_pagamento = format(
        calculateInstallmentDueDate(baseCardDueDate, indexInSeries, params.cardDueDay),
        "yyyy-MM-dd"
      );
    } else {
      data = format(occurrenceDate, "yyyy-MM-dd");
    }

    rows.push({
      user_id: params.user_id,
      conta_id: params.conta_id,
      categoria_id: params.categoria_id,
      valor: params.valor,
      tipo: params.tipo,
      data,
      data_pagamento,
      forma_pagamento: params.forma_pagamento,
      recorrencia: "fixa",
      descricao: params.descricao,
      is_pago_executado: false,
      parcela_atual: indexInSeries + 1,
      parcelas_total: null,
    });
  }

  return rows;
}

/**
 * Inserts a brand-new fixa recurrence series:
 * - Inserts the first row, captures its id (= series origin)
 * - Inserts the remaining rows with transacao_origem_id set
 * Returns the origin transaction id on success.
 */
export async function createFixaRecurrenceSeries(
  params: BuildFixaRowsParams
): Promise<{ originId: string; total: number } | { error: string }> {
  const rows = buildFixaRecurrenceRows(params);
  if (rows.length === 0) return { error: "Nenhuma linha gerada" };

  const { data: first, error: firstError } = await supabase
    .from("transacoes")
    .insert(rows[0])
    .select()
    .single();

  if (firstError || !first) {
    return { error: firstError?.message ?? "Erro ao criar transação" };
  }

  if (rows.length > 1) {
    const remaining = rows.slice(1).map(r => ({ ...r, transacao_origem_id: first.id }));
    const { error: remError } = await supabase.from("transacoes").insert(remaining);
    if (remError) {
      return { error: remError.message };
    }
  }

  return { originId: first.id, total: rows.length };
}

interface FixaSeriesOrigin {
  id: string;
  user_id: string;
  conta_id: string;
  categoria_id: string | null;
  valor: number;
  tipo: string;
  data: string;
  forma_pagamento: string;
  descricao: string | null;
}

interface ContaForExtension {
  id: string;
  tipo: string;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}

/**
 * Extends every fixa recurrence series for the given user so that it always has
 * at least FIXA_RECURRENCE_WINDOW_MONTHS rows ahead of "today".
 *
 * Strategy:
 *   1. Fetch all series origins (recorrencia='fixa' AND transacao_origem_id IS NULL).
 *   2. For each origin, find the latest existing child (or origin) date.
 *   3. If latest < today + EXTEND_THRESHOLD months, generate enough new rows to
 *      reach today + WINDOW months, all linked to origin via transacao_origem_id.
 *
 * Safe to call multiple times — only inserts missing rows.
 */
export async function extendFixaSeries(userId: string): Promise<{ inserted: number }> {
  if (!userId) return { inserted: 0 };

  const todayPlusThreshold = format(
    addMonths(new Date(), FIXA_RECURRENCE_EXTEND_THRESHOLD_MONTHS),
    "yyyy-MM-dd"
  );
  const todayPlusWindow = format(
    addMonths(new Date(), FIXA_RECURRENCE_WINDOW_MONTHS),
    "yyyy-MM-dd"
  );

  // 1. Fetch all series origins for this user
  const { data: origins, error: originsError } = await supabase
    .from("transacoes")
    .select("id, user_id, conta_id, categoria_id, valor, tipo, data, forma_pagamento, descricao")
    .eq("user_id", userId)
    .eq("recorrencia", "fixa")
    .is("transacao_origem_id", null);

  if (originsError || !origins || origins.length === 0) return { inserted: 0 };

  // 2. Fetch contas (for credit-card metadata)
  const { data: contasData } = await supabase
    .from("contas")
    .select("id, tipo, dia_fechamento, dia_vencimento");
  const contas = (contasData ?? []) as ContaForExtension[];

  let totalInserted = 0;

  for (const origin of origins as FixaSeriesOrigin[]) {
    // Find latest occurrence (origin or any child) for this series
    const { data: latestRow } = await supabase
      .from("transacoes")
      .select("data, parcela_atual")
      .or(`id.eq.${origin.id},transacao_origem_id.eq.${origin.id}`)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestDate = latestRow?.data ?? origin.data;
    const latestParcela = latestRow?.parcela_atual ?? 1;

    // No need to extend if already covered
    if (latestDate >= todayPlusThreshold && latestDate >= todayPlusWindow) {
      continue;
    }
    if (latestDate >= todayPlusWindow) continue;
    if (latestDate >= todayPlusThreshold) continue;

    // Compute how many new monthly rows are needed to reach today+WINDOW
    const latest = parseISO(latestDate);
    const target = addMonths(new Date(), FIXA_RECURRENCE_WINDOW_MONTHS);
    const monthsDiff =
      (target.getFullYear() - latest.getFullYear()) * 12 +
      (target.getMonth() - latest.getMonth());
    const monthsToAdd = Math.max(0, monthsDiff);
    if (monthsToAdd === 0) continue;

    const conta = contas.find(c => c.id === origin.conta_id);
    const isCreditCard = origin.forma_pagamento === "credito" && conta?.tipo === "credito";

    // Build rows starting AFTER the latest occurrence
    const rows = buildFixaRecurrenceRows({
      user_id: origin.user_id,
      conta_id: origin.conta_id,
      categoria_id: origin.categoria_id,
      valor: Number(origin.valor),
      tipo: origin.tipo,
      baseDate: parseISO(origin.data),
      forma_pagamento: origin.forma_pagamento,
      descricao: origin.descricao,
      isCreditCard,
      cardClosingDay: conta?.dia_fechamento ?? undefined,
      cardDueDay: conta?.dia_vencimento ?? undefined,
      months: monthsToAdd,
      startOffset: latestParcela, // continue numbering from after the last one
    }).map(r => ({ ...r, transacao_origem_id: origin.id }));

    if (rows.length === 0) continue;

    const { error: insertError } = await supabase.from("transacoes").insert(rows);
    if (!insertError) totalInserted += rows.length;
  }

  return { inserted: totalInserted };
}



// ==========================================
// Transaction Status Helpers
// ==========================================

/**
 * Determines if a transaction is considered "pending" (not executed)
 * Rule: null or false = pending
 */
export function isPendente(isPagoExecutado: boolean | null | undefined): boolean {
  return isPagoExecutado !== true;
}

/**
 * Determines if a transaction is considered "executed" (paid/completed)
 * Rule: only true = executed
 */
export function isExecutado(isPagoExecutado: boolean | null | undefined): boolean {
  return isPagoExecutado === true;
}

/**
 * Filters transactions that should count toward actual balance
 * Excludes: transfers, non-executed transactions
 */
export function filterTransacoesExecutadas<T extends { forma_pagamento: string; is_pago_executado: boolean | null }>(
  transacoes: T[]
): T[] {
  return transacoes.filter(
    t => t.forma_pagamento !== "transferencia" && isExecutado(t.is_pago_executado)
  );
}

/**
 * Filters transactions that should count toward calculations (excluding only transfers)
 * Used for budget, reports, etc.
 */
export function filterTransacoesValidas<T extends { forma_pagamento: string; is_pago_executado: boolean | null }>(
  transacoes: T[]
): T[] {
  return transacoes.filter(
    t => t.forma_pagamento !== "transferencia" && !isPendente(t.is_pago_executado)
  );
}

// ==========================================
// Credit Card Date Helpers
// ==========================================

interface TransacaoComDatas {
  data: string;
  data_pagamento?: string | null;
  conta_id: string;
}

interface TransacaoComCompetencia extends TransacaoComDatas {
  parcela_atual?: number | null;
}

interface ContaCartao {
  id: string;
  tipo: string;
  dia_fechamento?: number | null;
}

/**
 * Gets the effective date for a transaction in reports/budgets
 * For credit cards: uses data_pagamento (invoice due date) if available
 * For other accounts: uses data (transaction date)
 */
export function getDataEfetiva(transacao: TransacaoComDatas, contas: ContaCartao[]): string {
  const conta = contas.find(c => c.id === transacao.conta_id);
  
  // For credit card transactions, use data_pagamento if available
  if (conta?.tipo === "credito" && transacao.data_pagamento !== null && transacao.data_pagamento !== undefined && transacao.data_pagamento !== "") {
    return transacao.data_pagamento;
  }
  
  return transacao.data;
}

/**
 * Gets the invoice competence date used to place credit card purchases
 * in the correct open/closed invoice cycle.
 *
 * For credit card installments, the purchase date stays fixed for all rows,
 * but each installment belongs to a future invoice cycle.
 */
export function getDataCompetenciaTransacao(
  transacao: TransacaoComCompetencia,
  contas: ContaCartao[]
): string {
  const conta = contas.find(c => c.id === transacao.conta_id);

  if (conta?.tipo !== "credito") {
    return transacao.data;
  }

  const indiceParcela = Math.max(0, (transacao.parcela_atual ?? 1) - 1);

  if (indiceParcela === 0) {
    return transacao.data;
  }

  return format(addMonths(parseISO(transacao.data), indiceParcela), "yyyy-MM-dd");
}

/**
 * Filters transactions by effective date range
 * For credit cards, uses data_pagamento; for others, uses data
 */
export function filterTransacoesPorPeriodoEfetivo<T extends TransacaoComDatas>(
  transacoes: T[],
  contas: ContaCartao[],
  startDate: string,
  endDate: string
): T[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  
  return transacoes.filter(t => {
    const dataEfetiva = parseISO(getDataEfetiva(t, contas));
    return !isBefore(dataEfetiva, start) && !isAfter(dataEfetiva, end);
  });
}

/**
 * Filters transactions by invoice competence date.
 * Used for transaction listing and credit card invoice cycles.
 */
export function filterTransacoesPorPeriodoCompetencia<T extends TransacaoComCompetencia>(
  transacoes: T[],
  contas: ContaCartao[],
  startDate: string,
  endDate: string
): T[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  return transacoes.filter(t => {
    const dataCompetencia = parseISO(getDataCompetenciaTransacao(t, contas));
    return !isBefore(dataCompetencia, start) && !isAfter(dataCompetencia, end);
  });
}

// ==========================================
// Balance Calculation Helpers
// ==========================================

interface TransacaoSaldo {
  valor: number;
  tipo: string;
  conta_id: string;
  conta_destino_id?: string | null;
  forma_pagamento: string;
  is_pago_executado: boolean | null;
  data: string;
}

interface ContaSaldo {
  id: string;
  saldo_inicial: number;
  tipo: string;
}

/**
 * Calculates the real balance of an account using ALL executed transactions
 * This is independent of any date filters
 */
export function calcularSaldoRealConta(
  conta: ContaSaldo,
  todasTransacoes: TransacaoSaldo[]
): number {
  // Credit accounts don't count toward patrimony
  if (conta.tipo === "credito") return 0;
  
  const transacoesExecutadas = todasTransacoes.filter(t => isExecutado(t.is_pago_executado));
  const transacoesConta = transacoesExecutadas.filter(
    t => t.conta_id === conta.id || t.conta_destino_id === conta.id
  );

  const saldoMovimentacoes = transacoesConta.reduce((acc, t) => {
    const valor = Number(t.valor);
    const isTransferencia = t.forma_pagamento === "transferencia" || t.tipo === "transferencia";

    if (isTransferencia) {
      // Only process the expense record (has conta_destino_id).
      // The auto-generated receipt record (no conta_destino_id) is a
      // duplicate used for listing only – skip it to avoid double-counting.
      if (t.conta_destino_id) {
        if (t.conta_id === conta.id) return acc - valor;
        if (t.conta_destino_id === conta.id) return acc + valor;
      }
      return acc;
    }

    if (t.tipo === "receita" && t.conta_id === conta.id) return acc + valor;
    if (t.tipo === "despesa" && t.conta_id === conta.id) return acc - valor;

    return acc;
  }, 0);

  return Number(conta.saldo_inicial) + saldoMovimentacoes;
}

/**
 * Calculates the total real balance across all accounts
 * Excludes credit card accounts
 */
export function calcularSaldoTotalReal(
  contas: ContaSaldo[],
  todasTransacoes: TransacaoSaldo[]
): number {
  return contas.reduce((acc, conta) => {
    return acc + calcularSaldoRealConta(conta, todasTransacoes);
  }, 0);
}

/**
 * Calculates the balance at the end of a specific month
 * Uses all transactions up to and including that month
 */
export function calcularSaldoFimMes(
  contas: ContaSaldo[],
  todasTransacoes: TransacaoSaldo[],
  mes: Date
): number {
  const fimMes = format(endOfMonth(mes), "yyyy-MM-dd");
  
  return contas.reduce((acc, conta) => {
    if (conta.tipo === "credito") return acc;
    
    const transacoesAteMes = todasTransacoes.filter(t => {
      return (
        t.conta_id === conta.id &&
        t.forma_pagamento !== "transferencia" &&
        isExecutado(t.is_pago_executado) &&
        t.data <= fimMes // Only transactions up to end of month
      );
    });
    
    const receitas = transacoesAteMes
      .filter(t => t.tipo === "receita")
      .reduce((a, t) => a + Number(t.valor), 0);
    
    const despesas = transacoesAteMes
      .filter(t => t.tipo === "despesa")
      .reduce((a, t) => a + Number(t.valor), 0);
    
    return acc + Number(conta.saldo_inicial) + receitas - despesas;
  }, 0);
}

/**
 * Calculates patrimonial variation (percentage change from previous month)
 * Compares end-of-month balance for current vs previous month
 */
export function calcularVariacaoPatrimonial(
  contas: ContaSaldo[],
  todasTransacoes: TransacaoSaldo[],
  mesReferencia?: Date
): number | null {
  const mesAtual = mesReferencia || new Date();
  const mesAnterior = subMonths(mesAtual, 1);
  
  const saldoMesAnterior = calcularSaldoFimMes(contas, todasTransacoes, mesAnterior);
  const saldoMesAtual = calcularSaldoFimMes(contas, todasTransacoes, mesAtual);
  
  if (saldoMesAnterior === 0) return null;
  
  return ((saldoMesAtual - saldoMesAnterior) / Math.abs(saldoMesAnterior)) * 100;
}

// ==========================================
// Transaction Data Field
// ==========================================

/**
 * Adds a data field with transaction date
 * Needed for balance calculations that filter by date
 */
export function addDataField<T extends { data?: string }>(
  transacao: T & { data: string }
): T & { data: string } {
  return transacao;
}

// ==========================================
// Credit Card Open Invoice Calculation
// ==========================================

interface TransacaoFatura {
  conta_id: string;
  valor: number;
  tipo: string;
  data: string;
  data_pagamento?: string | null;
  is_pago_executado: boolean | null;
  parcela_atual?: number | null;
}

interface ContaCartaoFatura {
  id: string;
  tipo: string;
  dia_fechamento?: number | null;
  dia_vencimento?: number | null;
}

/**
 * Calculates the open invoice amount for a credit card.
 * Uses the billing cycle logic: only unpaid transactions whose competence date
 * falls within the current closed + open invoice cycles (not all historical debt).
 * 
 * This returns: closed invoice unpaid + open invoice total
 * (same as what appears in the "Próximos Fechamentos" widget)
 */
export function calcularFaturaAbertaCartao(
  cartao: ContaCartaoFatura,
  transacoes: TransacaoFatura[],
  contas: ContaCartaoFatura[]
): number {
  if (cartao.tipo !== "credito" || !cartao.dia_fechamento || !cartao.dia_vencimento) return 0;

  const diaFechamento = cartao.dia_fechamento;
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const mesHoje = hoje.getMonth();
  const anoHoje = hoje.getFullYear();

  const jaFechou = diaHoje >= diaFechamento;

  // Closed invoice cycle
  let fechadaInicio: Date;
  let fechadaFim: Date;

  if (jaFechou) {
    fechadaInicio = new Date(anoHoje, mesHoje - 1, diaFechamento + 1);
    fechadaFim = new Date(anoHoje, mesHoje, diaFechamento);
  } else {
    fechadaInicio = new Date(anoHoje, mesHoje - 2, diaFechamento + 1);
    fechadaFim = new Date(anoHoje, mesHoje - 1, diaFechamento);
  }

  // Open invoice cycle
  let abertaInicio: Date;
  let abertaFim: Date;

  if (jaFechou) {
    abertaInicio = new Date(anoHoje, mesHoje, diaFechamento + 1);
    abertaFim = new Date(anoHoje, mesHoje + 1, diaFechamento);
  } else {
    abertaInicio = new Date(anoHoje, mesHoje - 1, diaFechamento + 1);
    abertaFim = new Date(anoHoje, mesHoje, diaFechamento);
  }

  const fechadaInicioStr = format(fechadaInicio, "yyyy-MM-dd");
  const abertaFimStr = format(abertaFim, "yyyy-MM-dd");

  const transacoesCartao = transacoes.filter(t => t.conta_id === cartao.id && t.tipo === "despesa");

  // Get competence date for each transaction
  const getCompetencia = (t: TransacaoFatura) => {
    return getDataCompetenciaTransacao(
      { data: t.data, data_pagamento: t.data_pagamento, conta_id: t.conta_id, parcela_atual: t.parcela_atual },
      contas
    );
  };

  // Closed invoice: unpaid transactions in closed cycle + any older unpaid
  const faturaFechada = transacoesCartao
    .filter(t => {
      if (t.is_pago_executado === true) return false;
      const comp = getCompetencia(t);
      return comp <= format(fechadaFim, "yyyy-MM-dd");
    })
    .reduce((acc, t) => acc + Number(t.valor), 0);

  // Open invoice: all transactions in open cycle (regardless of payment status)
  const faturaAberta = transacoesCartao
    .filter(t => {
      const comp = getCompetencia(t);
      return comp >= format(abertaInicio, "yyyy-MM-dd") && comp <= abertaFimStr;
    })
    .reduce((acc, t) => acc + Number(t.valor), 0);

  return faturaFechada + faturaAberta;
}
