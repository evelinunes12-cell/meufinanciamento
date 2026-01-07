-- 1) Allow new value 'fixa' for transacoes.recorrencia (recreate check constraint safely)
DO $$
DECLARE
  c RECORD;
BEGIN
  -- Drop any existing CHECK constraints on public.transacoes that reference column recorrencia
  FOR c IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.transacoes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%recorrencia%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.transacoes DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.transacoes
ADD CONSTRAINT transacoes_recorrencia_check
CHECK (
  recorrencia IS NULL OR recorrencia IN ('nenhuma','semanal','mensal','anual','fixa')
);

-- 2) Fix FK to allow deleting parent installment by cascading children
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transacoes_transacao_origem_id_fkey'
      AND conrelid = 'public.transacoes'::regclass
  ) THEN
    ALTER TABLE public.transacoes
      DROP CONSTRAINT transacoes_transacao_origem_id_fkey;
  END IF;
END $$;

ALTER TABLE public.transacoes
ADD CONSTRAINT transacoes_transacao_origem_id_fkey
FOREIGN KEY (transacao_origem_id)
REFERENCES public.transacoes(id)
ON DELETE CASCADE;