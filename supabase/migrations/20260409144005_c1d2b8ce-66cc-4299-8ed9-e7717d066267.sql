
-- transacoes
ALTER POLICY "Users can view their own transactions" ON public.transacoes TO authenticated;
ALTER POLICY "Users can create their own transactions" ON public.transacoes TO authenticated;
ALTER POLICY "Users can update their own transactions" ON public.transacoes TO authenticated;
ALTER POLICY "Users can delete their own transactions" ON public.transacoes TO authenticated;

-- orcamentos
ALTER POLICY "Users can view their own budgets" ON public.orcamentos TO authenticated;
ALTER POLICY "Users can create their own budgets" ON public.orcamentos TO authenticated;
ALTER POLICY "Users can update their own budgets" ON public.orcamentos TO authenticated;
ALTER POLICY "Users can delete their own budgets" ON public.orcamentos TO authenticated;

-- categorias
ALTER POLICY "Users can view their own categories" ON public.categorias TO authenticated;
ALTER POLICY "Users can create their own categories" ON public.categorias TO authenticated;
ALTER POLICY "Users can update their own categories" ON public.categorias TO authenticated;
ALTER POLICY "Users can delete their own categories" ON public.categorias TO authenticated;

-- contas
ALTER POLICY "Users can view their own accounts" ON public.contas TO authenticated;
ALTER POLICY "Users can create their own accounts" ON public.contas TO authenticated;
ALTER POLICY "Users can update their own accounts" ON public.contas TO authenticated;
ALTER POLICY "Users can delete their own accounts" ON public.contas TO authenticated;

-- faturas_cartao
ALTER POLICY "Users can view their own invoices" ON public.faturas_cartao TO authenticated;
ALTER POLICY "Users can create their own invoices" ON public.faturas_cartao TO authenticated;
ALTER POLICY "Users can update their own invoices" ON public.faturas_cartao TO authenticated;
ALTER POLICY "Users can delete their own invoices" ON public.faturas_cartao TO authenticated;
