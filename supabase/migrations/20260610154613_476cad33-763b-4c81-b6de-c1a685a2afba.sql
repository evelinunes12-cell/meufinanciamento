
-- Atualiza CHECKs para aceitar 'transferencia'
ALTER TABLE public.categorias DROP CONSTRAINT IF EXISTS categorias_tipo_check;
ALTER TABLE public.categorias ADD CONSTRAINT categorias_tipo_check
  CHECK (tipo = ANY (ARRAY['receita'::text, 'despesa'::text, 'transferencia'::text]));

ALTER TABLE public.transacoes DROP CONSTRAINT IF EXISTS transacoes_tipo_check;
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_tipo_check
  CHECK (tipo = ANY (ARRAY['receita'::text, 'despesa'::text, 'transferencia'::text]));

-- Campo de sistema
ALTER TABLE public.categorias ADD COLUMN IF NOT EXISTS is_sistema boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS categorias_sistema_transferencia_unique
  ON public.categorias (user_id) WHERE is_sistema = true AND tipo = 'transferencia';

-- Cria categoria padrão para usuários existentes
INSERT INTO public.categorias (user_id, nome, tipo, cor, is_default, is_sistema)
SELECT u.id, 'Transferência entre contas', 'transferencia', '#64748B', true, true
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.categorias c
  WHERE c.user_id = u.id AND c.is_sistema = true AND c.tipo = 'transferencia'
);

-- Reaponta transações vinculadas a categorias de transferência manuais para a do sistema
UPDATE public.transacoes t
SET categoria_id = sys.id
FROM public.categorias old
JOIN public.categorias sys
  ON sys.user_id = old.user_id AND sys.is_sistema = true AND sys.tipo = 'transferencia'
WHERE t.categoria_id = old.id
  AND old.tipo = 'transferencia'
  AND old.is_sistema = false;

DELETE FROM public.categorias WHERE tipo = 'transferencia' AND is_sistema = false;

-- Backfill: transações antigas de transferência
UPDATE public.transacoes t
SET tipo = 'transferencia',
    categoria_id = sys.id
FROM public.categorias sys
WHERE t.forma_pagamento = 'transferencia'
  AND sys.user_id = t.user_id
  AND sys.is_sistema = true
  AND sys.tipo = 'transferencia';

-- Trigger atualizada para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, nome, celular, email, is_active)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nome',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name'
    ),
    NEW.raw_user_meta_data->>'celular',
    NEW.email,
    true
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    nome = COALESCE(public.profiles.nome, EXCLUDED.nome),
    celular = COALESCE(public.profiles.celular, EXCLUDED.celular),
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.categorias (user_id, nome, tipo, cor, is_default, is_sistema)
  VALUES (NEW.id, 'Transferência entre contas', 'transferencia', '#64748B', true, true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- RLS: bloqueia update/delete em categorias do sistema
DROP POLICY IF EXISTS "Users can update their own categorias" ON public.categorias;
DROP POLICY IF EXISTS "Users can delete their own categorias" ON public.categorias;

CREATE POLICY "Users can update their own categorias"
ON public.categorias FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND is_sistema = false)
WITH CHECK (auth.uid() = user_id AND is_sistema = false);

CREATE POLICY "Users can delete their own categorias"
ON public.categorias FOR DELETE TO authenticated
USING (auth.uid() = user_id AND is_sistema = false);
