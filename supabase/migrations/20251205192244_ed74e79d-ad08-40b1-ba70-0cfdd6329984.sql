-- Tabela de financiamento (apenas um registro ativo)
CREATE TABLE public.financiamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valor_financiado DECIMAL(15,2) NOT NULL,
  valor_parcela DECIMAL(15,2) NOT NULL,
  numero_parcelas INTEGER NOT NULL,
  taxa_diaria DECIMAL(8,6) DEFAULT 0.0006 NOT NULL,
  taxa_mensal DECIMAL(8,6) DEFAULT 0.0175 NOT NULL,
  data_primeira_parcela DATE NOT NULL,
  data_contratacao DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de parcelas
CREATE TABLE public.parcelas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financiamento_id UUID REFERENCES public.financiamento(id) ON DELETE CASCADE NOT NULL,
  numero_parcela INTEGER NOT NULL,
  data_vencimento DATE NOT NULL,
  valor_parcela DECIMAL(15,2) NOT NULL,
  pago BOOLEAN DEFAULT false,
  data_pagamento DATE,
  antecipada BOOLEAN DEFAULT false,
  valor_pago DECIMAL(15,2),
  amortizacao DECIMAL(15,2),
  juros DECIMAL(15,2),
  economia DECIMAL(15,2),
  dias_antecedencia INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índice para buscar parcelas por financiamento
CREATE INDEX idx_parcelas_financiamento ON public.parcelas(financiamento_id);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_financiamento_updated_at
  BEFORE UPDATE ON public.financiamento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_parcelas_updated_at
  BEFORE UPDATE ON public.parcelas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS (público por enquanto - sem autenticação)
ALTER TABLE public.financiamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcelas ENABLE ROW LEVEL SECURITY;

-- Políticas públicas para acesso total
CREATE POLICY "Acesso público financiamento" ON public.financiamento FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público parcelas" ON public.parcelas FOR ALL USING (true) WITH CHECK (true);