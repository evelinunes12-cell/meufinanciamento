
CREATE OR REPLACE FUNCTION public.is_account_active()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE user_id = auth.uid()), false)
$$;

-- categorias
DROP POLICY IF EXISTS "Users can view their own categories" ON public.categorias;
CREATE POLICY "Users can view their own categories" ON public.categorias FOR SELECT USING (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can create their own categories" ON public.categorias;
CREATE POLICY "Users can create their own categories" ON public.categorias FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can update their own categories" ON public.categorias;
CREATE POLICY "Users can update their own categories" ON public.categorias FOR UPDATE USING (auth.uid() = user_id AND public.is_account_active()) WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can delete their own categories" ON public.categorias;
CREATE POLICY "Users can delete their own categories" ON public.categorias FOR DELETE USING (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can update their own categorias" ON public.categorias;
CREATE POLICY "Users can update their own categorias" ON public.categorias FOR UPDATE USING (auth.uid() = user_id AND is_sistema = false AND public.is_account_active()) WITH CHECK (auth.uid() = user_id AND is_sistema = false AND public.is_account_active());
DROP POLICY IF EXISTS "Users can delete their own categorias" ON public.categorias;
CREATE POLICY "Users can delete their own categorias" ON public.categorias FOR DELETE USING (auth.uid() = user_id AND is_sistema = false AND public.is_account_active());

-- contas
DROP POLICY IF EXISTS "Users can view their own accounts" ON public.contas;
CREATE POLICY "Users can view their own accounts" ON public.contas FOR SELECT USING (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can create their own accounts" ON public.contas;
CREATE POLICY "Users can create their own accounts" ON public.contas FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can update their own accounts" ON public.contas;
CREATE POLICY "Users can update their own accounts" ON public.contas FOR UPDATE USING (auth.uid() = user_id AND public.is_account_active()) WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can delete their own accounts" ON public.contas;
CREATE POLICY "Users can delete their own accounts" ON public.contas FOR DELETE USING (auth.uid() = user_id AND public.is_account_active());

-- faturas_cartao
DROP POLICY IF EXISTS "Users can view their own invoices" ON public.faturas_cartao;
CREATE POLICY "Users can view their own invoices" ON public.faturas_cartao FOR SELECT USING (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can create their own invoices" ON public.faturas_cartao;
CREATE POLICY "Users can create their own invoices" ON public.faturas_cartao FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can update their own invoices" ON public.faturas_cartao;
CREATE POLICY "Users can update their own invoices" ON public.faturas_cartao FOR UPDATE USING (auth.uid() = user_id AND public.is_account_active()) WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can delete their own invoices" ON public.faturas_cartao;
CREATE POLICY "Users can delete their own invoices" ON public.faturas_cartao FOR DELETE USING (auth.uid() = user_id AND public.is_account_active());

-- financiamento
DROP POLICY IF EXISTS "Users can view their own financing" ON public.financiamento;
CREATE POLICY "Users can view their own financing" ON public.financiamento FOR SELECT USING (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can create their own financing" ON public.financiamento;
CREATE POLICY "Users can create their own financing" ON public.financiamento FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can update their own financing" ON public.financiamento;
CREATE POLICY "Users can update their own financing" ON public.financiamento FOR UPDATE USING (auth.uid() = user_id AND public.is_account_active()) WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can delete their own financing" ON public.financiamento;
CREATE POLICY "Users can delete their own financing" ON public.financiamento FOR DELETE USING (auth.uid() = user_id AND public.is_account_active());

-- orcamentos
DROP POLICY IF EXISTS "Users can view their own budgets" ON public.orcamentos;
CREATE POLICY "Users can view their own budgets" ON public.orcamentos FOR SELECT USING (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can create their own budgets" ON public.orcamentos;
CREATE POLICY "Users can create their own budgets" ON public.orcamentos FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can update their own budgets" ON public.orcamentos;
CREATE POLICY "Users can update their own budgets" ON public.orcamentos FOR UPDATE USING (auth.uid() = user_id AND public.is_account_active()) WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can delete their own budgets" ON public.orcamentos;
CREATE POLICY "Users can delete their own budgets" ON public.orcamentos FOR DELETE USING (auth.uid() = user_id AND public.is_account_active());

-- transacoes
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transacoes;
CREATE POLICY "Users can view their own transactions" ON public.transacoes FOR SELECT USING (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can create their own transactions" ON public.transacoes;
CREATE POLICY "Users can create their own transactions" ON public.transacoes FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can update their own transactions" ON public.transacoes;
CREATE POLICY "Users can update their own transactions" ON public.transacoes FOR UPDATE USING (auth.uid() = user_id AND public.is_account_active()) WITH CHECK (auth.uid() = user_id AND public.is_account_active());
DROP POLICY IF EXISTS "Users can delete their own transactions" ON public.transacoes;
CREATE POLICY "Users can delete their own transactions" ON public.transacoes FOR DELETE USING (auth.uid() = user_id AND public.is_account_active());

-- parcelas (through financiamento)
DROP POLICY IF EXISTS "Users can view their own parcelas" ON public.parcelas;
CREATE POLICY "Users can view their own parcelas" ON public.parcelas FOR SELECT USING (public.is_account_active() AND EXISTS (SELECT 1 FROM public.financiamento f WHERE f.id = parcelas.financiamento_id AND f.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can create parcelas for their own financing" ON public.parcelas;
CREATE POLICY "Users can create parcelas for their own financing" ON public.parcelas FOR INSERT WITH CHECK (public.is_account_active() AND EXISTS (SELECT 1 FROM public.financiamento f WHERE f.id = parcelas.financiamento_id AND f.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update their own parcelas" ON public.parcelas;
CREATE POLICY "Users can update their own parcelas" ON public.parcelas FOR UPDATE USING (public.is_account_active() AND EXISTS (SELECT 1 FROM public.financiamento f WHERE f.id = parcelas.financiamento_id AND f.user_id = auth.uid())) WITH CHECK (public.is_account_active() AND EXISTS (SELECT 1 FROM public.financiamento f WHERE f.id = parcelas.financiamento_id AND f.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete their own parcelas" ON public.parcelas;
CREATE POLICY "Users can delete their own parcelas" ON public.parcelas FOR DELETE USING (public.is_account_active() AND EXISTS (SELECT 1 FROM public.financiamento f WHERE f.id = parcelas.financiamento_id AND f.user_id = auth.uid()));
