import { useLocation } from "react-router-dom";
import SEO from "@/components/SEO";

interface RouteMeta {
  title: string;
  description: string;
  noindex?: boolean;
}

const ROUTES: Record<string, RouteMeta> = {
  "/": {
    title: "Início",
    description: "Acesse o painel do Soma para controlar gastos, faturas e projeções financeiras.",
  },
  "/auth": {
    title: "Login e Cadastro",
    description: "Entre na sua conta Soma ou crie uma nova para gerenciar suas finanças pessoais.",
  },
  "/reset-password": {
    title: "Redefinir senha",
    description: "Defina uma nova senha para acessar a sua conta Soma.",
    noindex: true,
  },
  "/financas": {
    title: "Dashboard de Finanças",
    description: "Visão geral de saldo, receitas, despesas, faturas de cartão e projeções.",
    noindex: true,
  },
  "/financas/transacoes": {
    title: "Transações",
    description: "Gerencie receitas, despesas e transferências com filtros avançados.",
    noindex: true,
  },
  "/financas/contas": {
    title: "Contas",
    description: "Cadastre e acompanhe os saldos das suas contas bancárias.",
    noindex: true,
  },
  "/financas/categorias": {
    title: "Categorias",
    description: "Organize suas transações em categorias e subcategorias hierárquicas.",
    noindex: true,
  },
  "/financas/cartoes": {
    title: "Cartões de Crédito",
    description: "Acompanhe faturas, fechamento e pagamento dos seus cartões.",
    noindex: true,
  },
  "/financas/orcamento": {
    title: "Orçamento",
    description: "Defina limites por categoria e receba alertas ao atingir 90% do orçamento.",
    noindex: true,
  },
  "/financas/relatorios": {
    title: "Relatórios",
    description: "Análises detalhadas das suas finanças com gráficos e exportações.",
    noindex: true,
  },
  "/financas/projecao": {
    title: "Projeção de Caixa",
    description: "Previsão de fluxo de caixa para 3, 6 e 12 meses pelas datas de pagamento.",
    noindex: true,
  },
  "/financas/recorrencias": {
    title: "Recorrências",
    description: "Gerencie suas transações fixas e séries recorrentes.",
    noindex: true,
  },
  "/financas/configuracoes": {
    title: "Configurações",
    description: "Ajustes da sua conta, importação OFX e preferências do Soma.",
    noindex: true,
  },
  "/financiamento": {
    title: "Configuração de Financiamento",
    description: "Configure o seu financiamento de veículo no Soma.",
    noindex: true,
  },
  "/financiamento/parcelas": {
    title: "Parcelas do Financiamento",
    description: "Acompanhe e antecipe parcelas do seu financiamento com cálculo de desconto.",
    noindex: true,
  },
  "/financiamento/dashboard": {
    title: "Dashboard de Financiamento",
    description: "Visão geral do andamento e custos do seu financiamento.",
    noindex: true,
  },
};

const FALLBACK: RouteMeta = {
  title: "Página não encontrada",
  description: "A página solicitada não foi encontrada no Soma.",
  noindex: true,
};

const RouteSEO = () => {
  const { pathname } = useLocation();
  const meta = ROUTES[pathname] ?? FALLBACK;
  return (
    <SEO
      title={meta.title}
      description={meta.description}
      path={pathname}
      noindex={meta.noindex}
    />
  );
};

export default RouteSEO;
