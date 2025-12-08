-- Add user_id column to financiamento table (NOT NULL after backfill)
ALTER TABLE public.financiamento ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop the overly permissive policy on financiamento
DROP POLICY IF EXISTS "Acesso público financiamento" ON public.financiamento;

-- Create owner-scoped RLS policies for financiamento
CREATE POLICY "Users can view their own financing"
ON public.financiamento
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own financing"
ON public.financiamento
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own financing"
ON public.financiamento
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own financing"
ON public.financiamento
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Drop the overly permissive policy on parcelas
DROP POLICY IF EXISTS "Acesso público parcelas" ON public.parcelas;

-- Create owner-scoped RLS policies for parcelas (through financiamento relationship)
CREATE POLICY "Users can view their own parcelas"
ON public.parcelas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = parcelas.financiamento_id
    AND f.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create parcelas for their own financing"
ON public.parcelas
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = financiamento_id
    AND f.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own parcelas"
ON public.parcelas
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = parcelas.financiamento_id
    AND f.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = financiamento_id
    AND f.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own parcelas"
ON public.parcelas
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = parcelas.financiamento_id
    AND f.user_id = auth.uid()
  )
);