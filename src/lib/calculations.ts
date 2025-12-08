import { differenceInDays, parseISO } from "date-fns";

export interface CalculoAntecipacao {
  valorOriginal: number;
  valorPago: number;
  economia: number;
  diasAntecedencia: number;
  juros: number;
  amortizacao: number;
  isAntecipada: boolean;
  isAtrasada: boolean;
}

/**
 * Calcula o valor presente de uma parcela usando a fórmula bancária (Itaú)
 * valor_presente = valor_parcela / (1 + taxa_diaria) ^ dias_antecedencia
 */
export function calcularAntecipacao(
  valorParcela: number,
  dataVencimento: string,
  dataPagamento: Date,
  taxaDiaria: number,
  saldoDevedor?: number
): CalculoAntecipacao {
  const vencimento = parseISO(dataVencimento);
  const diasDiferenca = differenceInDays(vencimento, dataPagamento);

  // Pagamento atrasado (após vencimento)
  if (diasDiferenca < 0) {
    return {
      valorOriginal: valorParcela,
      valorPago: valorParcela, // Sem desconto para atraso
      economia: 0,
      diasAntecedencia: 0,
      juros: valorParcela * taxaDiaria * 30, // Estimativa de juros mensais
      amortizacao: valorParcela - (valorParcela * taxaDiaria * 30),
      isAntecipada: false,
      isAtrasada: true,
    };
  }

  // Pagamento no vencimento
  if (diasDiferenca === 0) {
    const jurosEstimado = valorParcela * taxaDiaria * 30;
    return {
      valorOriginal: valorParcela,
      valorPago: valorParcela,
      economia: 0,
      diasAntecedencia: 0,
      juros: jurosEstimado,
      amortizacao: valorParcela - jurosEstimado,
      isAntecipada: false,
      isAtrasada: false,
    };
  }

  // Pagamento antecipado - Fórmula bancária (desconto simples)
  // valor_presente = valor_parcela / (1 + taxa_diaria * dias_antecedencia)
  // Esta é a fórmula mais comum usada por bancos brasileiros como Itaú
  const fatorDesconto = 1 + (taxaDiaria * diasDiferenca);
  const valorPresente = valorParcela / fatorDesconto;
  const economia = valorParcela - valorPresente;

  // Cálculo de juros e amortização
  // Juros são proporcionais ao tempo até o vencimento
  const jurosProporcional = valorParcela * taxaDiaria * (30 - diasDiferenca);
  const amortizacao = valorPresente - Math.max(0, jurosProporcional);

  return {
    valorOriginal: valorParcela,
    valorPago: Math.round(valorPresente * 100) / 100,
    economia: Math.round(economia * 100) / 100,
    diasAntecedencia: diasDiferenca,
    juros: Math.max(0, Math.round(jurosProporcional * 100) / 100),
    amortizacao: Math.max(0, Math.round(amortizacao * 100) / 100),
    isAntecipada: true,
    isAtrasada: false,
  };
}

/**
 * Calcula o saldo devedor considerando parcelas pagas
 */
export function calcularSaldoDevedor(
  valorFinanciado: number,
  parcelas: Array<{
    pago: boolean;
    amortizacao: number | null;
    valor_parcela: number;
  }>
): number {
  const totalAmortizado = parcelas
    .filter((p) => p.pago)
    .reduce((sum, p) => sum + (p.amortizacao || 0), 0);

  return Math.max(0, valorFinanciado - totalAmortizado);
}

/**
 * Formata valor para moeda brasileira
 */
export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Formata porcentagem
 */
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Converte string de moeda para número
 */
export function parseCurrencyInput(value: string): number {
  const numbers = value.replace(/\D/g, "");
  return parseFloat(numbers) / 100;
}

/**
 * Formata input de moeda
 */
export function formatCurrencyInput(value: string): string {
  const numbers = value.replace(/\D/g, "");
  const amount = parseFloat(numbers) / 100;
  if (isNaN(amount)) return "";
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
