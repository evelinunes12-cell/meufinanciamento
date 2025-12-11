-- Add new columns to transacoes table for advanced financial management
ALTER TABLE public.transacoes 
ADD COLUMN IF NOT EXISTS parcelas_total INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS parcela_atual INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_pago_executado BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS data_execucao_pagamento DATE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS conta_destino_id UUID REFERENCES public.contas(id) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS transacao_origem_id UUID REFERENCES public.transacoes(id) DEFAULT NULL;

-- Add index for better performance on queries
CREATE INDEX IF NOT EXISTS idx_transacoes_transacao_origem_id ON public.transacoes(transacao_origem_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_conta_destino_id ON public.transacoes(conta_destino_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_is_pago_executado ON public.transacoes(is_pago_executado);