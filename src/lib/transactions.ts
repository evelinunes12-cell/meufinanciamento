/**
 * Centralized transaction utilities
 * Provides unified rules for transaction status and balance calculations
 */

import { endOfMonth, startOfMonth, subMonths, parseISO, isBefore, isAfter, format } from "date-fns";

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
  if (conta?.tipo === "credito" && transacao.data_pagamento) {
    return transacao.data_pagamento;
  }
  
  return transacao.data;
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

// ==========================================
// Balance Calculation Helpers
// ==========================================

interface TransacaoSaldo {
  valor: number;
  tipo: string;
  conta_id: string;
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
  
  const transacoesConta = filterTransacoesExecutadas(
    todasTransacoes.filter(t => t.conta_id === conta.id)
  );
  
  const receitas = transacoesConta
    .filter(t => t.tipo === "receita")
    .reduce((acc, t) => acc + Number(t.valor), 0);
  
  const despesas = transacoesConta
    .filter(t => t.tipo === "despesa")
    .reduce((acc, t) => acc + Number(t.valor), 0);
  
  return Number(conta.saldo_inicial) + receitas - despesas;
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
