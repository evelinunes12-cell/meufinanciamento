-- Adicionar coluna data_pagamento para armazenar a data de vencimento da fatura do cartão
ALTER TABLE public.transacoes 
ADD COLUMN IF NOT EXISTS data_pagamento date;

-- Criar índice para melhorar performance das queries de pagamento de fatura
CREATE INDEX IF NOT EXISTS idx_transacoes_data_pagamento 
ON public.transacoes (conta_id, is_pago_executado, data_pagamento);