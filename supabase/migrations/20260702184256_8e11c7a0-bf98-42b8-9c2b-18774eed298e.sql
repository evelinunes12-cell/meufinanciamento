
-- ============ categorias ============
DROP POLICY IF EXISTS "Users can create their own categories" ON public.categorias;
DROP POLICY IF EXISTS "Users can delete their own categorias" ON public.categorias;
DROP POLICY IF EXISTS "Users can delete their own categories" ON public.categorias;
DROP POLICY IF EXISTS "Users can update their own categorias" ON public.categorias;
DROP POLICY IF EXISTS "Users can update their own categories" ON public.categorias;
DROP POLICY IF EXISTS "Users can view their own categories" ON public.categorias;

CREATE POLICY "Users can create their own categories" ON public.categorias
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can delete their own categorias" ON public.categorias
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) AND (is_sistema = false) AND is_account_active());
CREATE POLICY "Users can update their own categorias" ON public.categorias
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) AND (is_sistema = false) AND is_account_active())
  WITH CHECK ((auth.uid() = user_id) AND (is_sistema = false) AND is_account_active());
CREATE POLICY "Users can view their own categories" ON public.categorias
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());

-- ============ contas ============
DROP POLICY IF EXISTS "Users can create their own accounts" ON public.contas;
DROP POLICY IF EXISTS "Users can delete their own accounts" ON public.contas;
DROP POLICY IF EXISTS "Users can update their own accounts" ON public.contas;
DROP POLICY IF EXISTS "Users can view their own accounts" ON public.contas;

CREATE POLICY "Users can create their own accounts" ON public.contas
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can delete their own accounts" ON public.contas
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can update their own accounts" ON public.contas
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active())
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can view their own accounts" ON public.contas
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());

-- ============ faturas_cartao ============
DROP POLICY IF EXISTS "Users can create their own invoices" ON public.faturas_cartao;
DROP POLICY IF EXISTS "Users can delete their own invoices" ON public.faturas_cartao;
DROP POLICY IF EXISTS "Users can update their own invoices" ON public.faturas_cartao;
DROP POLICY IF EXISTS "Users can view their own invoices" ON public.faturas_cartao;

CREATE POLICY "Users can create their own invoices" ON public.faturas_cartao
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can delete their own invoices" ON public.faturas_cartao
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can update their own invoices" ON public.faturas_cartao
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active())
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can view their own invoices" ON public.faturas_cartao
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());

-- ============ financiamento ============
DROP POLICY IF EXISTS "Users can create their own financing" ON public.financiamento;
DROP POLICY IF EXISTS "Users can delete their own financing" ON public.financiamento;
DROP POLICY IF EXISTS "Users can update their own financing" ON public.financiamento;
DROP POLICY IF EXISTS "Users can view their own financing" ON public.financiamento;

CREATE POLICY "Users can create their own financing" ON public.financiamento
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can delete their own financing" ON public.financiamento
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can update their own financing" ON public.financiamento
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active())
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can view their own financing" ON public.financiamento
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());

-- ============ orcamentos ============
DROP POLICY IF EXISTS "Users can create their own budgets" ON public.orcamentos;
DROP POLICY IF EXISTS "Users can delete their own budgets" ON public.orcamentos;
DROP POLICY IF EXISTS "Users can update their own budgets" ON public.orcamentos;
DROP POLICY IF EXISTS "Users can view their own budgets" ON public.orcamentos;

CREATE POLICY "Users can create their own budgets" ON public.orcamentos
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can delete their own budgets" ON public.orcamentos
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can update their own budgets" ON public.orcamentos
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active())
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can view their own budgets" ON public.orcamentos
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());

-- ============ transacoes ============
DROP POLICY IF EXISTS "Users can create their own transactions" ON public.transacoes;
DROP POLICY IF EXISTS "Users can delete their own transactions" ON public.transacoes;
DROP POLICY IF EXISTS "Users can update their own transactions" ON public.transacoes;
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transacoes;

CREATE POLICY "Users can create their own transactions" ON public.transacoes
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can delete their own transactions" ON public.transacoes
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can update their own transactions" ON public.transacoes
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active())
  WITH CHECK ((auth.uid() = user_id) AND is_account_active());
CREATE POLICY "Users can view their own transactions" ON public.transacoes
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) AND is_account_active());

-- ============ parcelas ============
DROP POLICY IF EXISTS "Users can create parcelas for their own financing" ON public.parcelas;
DROP POLICY IF EXISTS "Users can delete their own parcelas" ON public.parcelas;
DROP POLICY IF EXISTS "Users can update their own parcelas" ON public.parcelas;
DROP POLICY IF EXISTS "Users can view their own parcelas" ON public.parcelas;

CREATE POLICY "Users can create parcelas for their own financing" ON public.parcelas
  FOR INSERT TO authenticated
  WITH CHECK (is_account_active() AND EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = parcelas.financiamento_id AND f.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete their own parcelas" ON public.parcelas
  FOR DELETE TO authenticated
  USING (is_account_active() AND EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = parcelas.financiamento_id AND f.user_id = auth.uid()
  ));
CREATE POLICY "Users can update their own parcelas" ON public.parcelas
  FOR UPDATE TO authenticated
  USING (is_account_active() AND EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = parcelas.financiamento_id AND f.user_id = auth.uid()
  ))
  WITH CHECK (is_account_active() AND EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = parcelas.financiamento_id AND f.user_id = auth.uid()
  ));
CREATE POLICY "Users can view their own parcelas" ON public.parcelas
  FOR SELECT TO authenticated
  USING (is_account_active() AND EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.id = parcelas.financiamento_id AND f.user_id = auth.uid()
  ));

-- ============ Revoke SECURITY DEFINER function execute from anon/public ============
REVOKE ALL ON FUNCTION public.is_account_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_active() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_ultimo_acesso() FROM PUBLIC, anon;
