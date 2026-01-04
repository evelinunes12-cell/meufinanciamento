import { z } from 'zod';

// Transacoes validation schema - Updated for advanced financial management
export const transacaoSchema = z.object({
  conta_id: z.string().uuid({ message: "Conta inválida" }),
  categoria_id: z.string().uuid({ message: "Categoria inválida" }).nullable().optional(),
  valor: z.number({ invalid_type_error: "Valor deve ser um número" })
    .positive({ message: "Valor deve ser maior que zero" })
    .max(999999999.99, { message: "Valor máximo excedido" }),
  tipo: z.enum(['receita', 'despesa'], { message: "Tipo deve ser receita ou despesa" }),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida" }),
  forma_pagamento: z.enum(['pix', 'debito', 'credito', 'dinheiro', 'transferencia', 'outro'], { message: "Forma de pagamento inválida" }),
  recorrencia: z.enum(['nenhuma', 'semanal', 'mensal', 'anual'], { message: "Recorrência inválida" }),
  descricao: z.string().max(500, { message: "Descrição muito longa" }).nullable().optional(),
  // New fields for advanced management
  parcelas_total: z.number({ invalid_type_error: "Número de parcelas deve ser um número" })
    .int({ message: "Número de parcelas deve ser inteiro" })
    .min(1, { message: "Mínimo de 1 parcela" })
    .max(360, { message: "Máximo de 360 parcelas" })
    .nullable()
    .optional(),
  parcela_atual: z.number({ invalid_type_error: "Parcela atual deve ser um número" })
    .int({ message: "Parcela atual deve ser inteira" })
    .min(1, { message: "Mínimo parcela 1" })
    .nullable()
    .optional(),
  is_pago_executado: z.boolean().nullable().optional(),
  data_execucao_pagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data de execução inválida" }).nullable().optional(),
  conta_destino_id: z.string().uuid({ message: "Conta destino inválida" }).nullable().optional(),
  transacao_origem_id: z.string().uuid({ message: "Transação origem inválida" }).nullable().optional(),
}).refine((data) => {
  // Validação: se for transferência, conta_destino_id é obrigatório
  if (data.forma_pagamento === 'transferencia' && !data.conta_destino_id) {
    return false;
  }
  return true;
}, {
  message: "Conta destino é obrigatória para transferências",
  path: ["conta_destino_id"],
}).refine((data) => {
  // Validação: se for crédito ou recorrência, parcelas_total é recomendado
  // Mas não obrigatório para permitir flexibilidade
  return true;
}, {
  message: "Número de parcelas é obrigatório para crédito ou recorrência",
  path: ["parcelas_total"],
});

// Contas validation schema
export const contaSchema = z.object({
  nome_conta: z.string()
    .min(1, { message: "Nome da conta é obrigatório" })
    .max(100, { message: "Nome da conta muito longo" }),
  tipo: z.enum(['corrente', 'poupanca', 'carteira', 'investimento', 'credito'], { message: "Tipo de conta inválido" }),
  saldo_inicial: z.number({ invalid_type_error: "Saldo deve ser um número" })
    .min(-999999999.99, { message: "Valor mínimo excedido" })
    .max(999999999.99, { message: "Valor máximo excedido" }),
  cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { message: "Cor inválida" }),
  limite: z.number({ invalid_type_error: "Limite deve ser um número" })
    .min(0, { message: "Limite deve ser positivo" })
    .max(999999999.99, { message: "Limite máximo excedido" })
    .nullable()
    .optional(),
  dia_fechamento: z.number({ invalid_type_error: "Dia de fechamento deve ser um número" })
    .int({ message: "Dia deve ser inteiro" })
    .min(1, { message: "Dia deve ser entre 1 e 31" })
    .max(31, { message: "Dia deve ser entre 1 e 31" })
    .nullable()
    .optional(),
  dia_vencimento: z.number({ invalid_type_error: "Dia de vencimento deve ser um número" })
    .int({ message: "Dia deve ser inteiro" })
    .min(1, { message: "Dia deve ser entre 1 e 31" })
    .max(31, { message: "Dia deve ser entre 1 e 31" })
    .nullable()
    .optional(),
});

// Financiamento validation schema
export const financiamentoSchema = z.object({
  valor_financiado: z.number({ invalid_type_error: "Valor financiado deve ser um número" })
    .positive({ message: "Valor financiado deve ser maior que zero" })
    .max(999999999.99, { message: "Valor máximo excedido" }),
  valor_parcela: z.number({ invalid_type_error: "Valor da parcela deve ser um número" })
    .positive({ message: "Valor da parcela deve ser maior que zero" })
    .max(999999999.99, { message: "Valor máximo excedido" }),
  numero_parcelas: z.number({ invalid_type_error: "Número de parcelas deve ser um número" })
    .int({ message: "Número de parcelas deve ser inteiro" })
    .min(1, { message: "Mínimo de 1 parcela" })
    .max(600, { message: "Máximo de 600 parcelas" }),
  taxa_diaria: z.number({ invalid_type_error: "Taxa diária deve ser um número" })
    .min(0, { message: "Taxa diária deve ser positiva" })
    .max(1, { message: "Taxa diária máxima de 100%" }),
  taxa_mensal: z.number({ invalid_type_error: "Taxa mensal deve ser um número" })
    .min(0, { message: "Taxa mensal deve ser positiva" })
    .max(1, { message: "Taxa mensal máxima de 100%" }),
  data_primeira_parcela: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida" }),
  data_contratacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida" }).nullable().optional(),
});

// Categoria validation schema
export const categoriaSchema = z.object({
  nome: z.string()
    .min(1, { message: "Nome é obrigatório" })
    .max(100, { message: "Nome muito longo (máximo 100 caracteres)" })
    .trim()
    .refine(val => val.length > 0, { message: "Nome não pode ser apenas espaços" }),
  tipo: z.enum(['receita', 'despesa'], { message: "Tipo inválido" }),
  cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { message: "Cor deve ser um código hexadecimal válido" }),
});

export type TransacaoInput = z.infer<typeof transacaoSchema>;
export type ContaInput = z.infer<typeof contaSchema>;
export type FinanciamentoInput = z.infer<typeof financiamentoSchema>;
export type CategoriaInput = z.infer<typeof categoriaSchema>;
