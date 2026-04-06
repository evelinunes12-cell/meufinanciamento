-- Allow new value 'rendimento' for transacoes.forma_pagamento
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.transacoes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%forma_pagamento%'
  LOOP
    EXECUTE format('ALTER TABLE public.transacoes DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.transacoes
ADD CONSTRAINT transacoes_forma_pagamento_check
CHECK (forma_pagamento IN ('pix', 'debito', 'credito', 'dinheiro', 'rendimento', 'transferencia', 'outro'));
