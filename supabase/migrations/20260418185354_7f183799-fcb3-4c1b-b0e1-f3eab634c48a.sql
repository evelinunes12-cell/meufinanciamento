ALTER TABLE public.contas
ADD COLUMN IF NOT EXISTS incluir_no_saldo boolean NOT NULL DEFAULT true;