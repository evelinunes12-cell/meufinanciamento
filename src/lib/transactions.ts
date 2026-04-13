/**
 * Centralized transaction utilities
 * Provides unified rules for transaction status and balance calculations
 */

import { addMonths, endOfMonth, startOfMonth, subMonths, parseISO, isBefore, isAfter, format } from "date-fns";

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
