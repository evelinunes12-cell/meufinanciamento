ALTER TABLE public.transacoes
ADD COLUMN IF NOT EXISTS mes_fatura_override text;

COMMENT ON COLUMN public.transacoes.mes_fatura_override IS 'Forced invoice month in YYYY-MM format. Used to manually move a credit card transaction between invoices. NULL means use the natural cycle calculation.';