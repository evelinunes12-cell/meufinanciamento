-- Migração aditiva para suportar múltiplos contratos (financiamento/emprestimo)
ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS nome text;

ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS tipo text;

ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS icone text;

UPDATE public.financiamento
SET nome = COALESCE(nome, 'Financiamento Atual'),
    tipo = COALESCE(tipo, 'financiamento')
WHERE nome IS NULL OR tipo IS NULL;

ALTER TABLE public.financiamento
  ALTER COLUMN nome SET DEFAULT 'Financiamento Atual',
  ALTER COLUMN nome SET NOT NULL,
  ALTER COLUMN tipo SET DEFAULT 'financiamento',
  ALTER COLUMN tipo SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financiamento_tipo_check'
      AND conrelid = 'public.financiamento'::regclass
  ) THEN
    ALTER TABLE public.financiamento
      ADD CONSTRAINT financiamento_tipo_check
      CHECK (tipo IN ('financiamento', 'emprestimo'));
  END IF;
END $$;
