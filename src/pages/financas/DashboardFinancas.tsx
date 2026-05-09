import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, CreditCard, ArrowUpDown, Info, Clock, HandCoins } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { useState, useMemo, useEffect } from "react";
import { AdvancedFilters, FilterState, getInitialFilterState, getDateRangeFromFilters, getCategoryIdsForFilter } from "@/components/AdvancedFilters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomizeDashboardModal, useWidgetVisibility } from "@/components/dashboard/DashboardWidgets";
import { UltimasTransacoesWidget } from "@/components/dashboard/UltimasTransacoesWidget";
import { ContasConfirmarWidget } from "@/components/dashboard/ContasConfirmarWidget";
import { EvolucaoMensalWidget } from "@/components/dashboard/EvolucaoMensalWidget";
import { ProximosFechamentosWidget } from "@/components/dashboard/ProximosFechamentosWidget";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  isExecutado, 
  isPendente, 
  calcularSaldoTotalReal, 
  calcularVariacaoPatrimonial,
  calcularSaldoRealConta,
  calcularFaturaAbertaCartao
} from "@/lib/transactions";

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  categoria_id: string | null;
  conta_id: string;
  conta_destino_id?: string | null;
  forma_pagamento: string;
  is_pago_executado: boolean | null;
  descricao: string | null;
}

interface Conta {
  id: string;
  nome_conta: string;
  saldo_inicial: number;
  tipo: string;
  cor: string;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  incluir_no_saldo: boolean | null;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  cor: string;
  categoria_pai_id: string | null;
}

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

async function fetchDashboardData(userId: string | undefined, startDate: string, endDate: string) {
  if (!userId) return null;

  const [transacoesPeriodoRes, contasRes, categoriasRes, todasTransacoesRes] = await Promise.all([
    supabase
      .from("transacoes")
      .select("*")
      .gte("data", startDate)
      .lte("data", endDate)
      .order("data", { ascending: false }),
    supabase.from("contas").select("*"),
    supabase.from("categorias").select("*"),
    // Fetch ALL transactions for widgets with specific rules (no date filter)
    supabase
      .from("transacoes")
      .select("*")
      .order("data", { ascending: false }),
  ]);

  return {
    transacoesPeriodo: (transacoesPeriodoRes.data || []) as Transacao[],
    todasTransacoes: (todasTransacoesRes.data || []) as Transacao[],
    contas: (contasRes.data || []) as Conta[],
    categorias: (categoriasRes.data || []) as Categoria[],
  };
}

const DashboardFinancas = () => {
  const { user } = useAuth();
  const { visibility, setVisibility } = useWidgetVisibility();
  const storageKey = useMemo(() => `dashboard-financas-filters-${user?.id || "anon"}`, [user?.id]);
  const [filters, setFilters] = useState<FilterState>(getInitialFilterState);
  
  const [saldoContasMode, setSaldoContasMode] = useState<"total" | "mes">("total");
  const [drilldown, setDrilldown] = useState<{ tipo: "despesa" | "receita"; categoriaId: string } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      setFilters(JSON.parse(saved));
    } catch {
      setFilters(getInitialFilterState());
    }
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(filters));
  }, [filters, storageKey]);

  const handleRestoreDefaultFilter = () => {
    const initial = getInitialFilterState();
    setFilters(initial);
    localStorage.setItem(storageKey, JSON.stringify(initial));
  };

  const { startDate, endDate } = getDateRangeFromFilters(filters);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-financas", user?.id, startDate, endDate],
    queryFn: () => fetchDashboardData(user?.id, startDate, endDate),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const transacoesPeriodo = data?.transacoesPeriodo || [];
  const contas = data?.contas || [];
  const categorias = data?.categorias || [];
  const todasTransacoes = data?.todasTransacoes || [];

  // Apply client-side filters
  const transacoesFiltradas = transacoesPeriodo.filter((t) => {
    if (filters.tipo && t.tipo !== filters.tipo) return false;
    
    // Category filter - includes subcategories when parent is selected
    if (filters.categoriaId || filters.subcategoriaId) {
      const categoryIds = getCategoryIdsForFilter(
        filters.categoriaId, 
        filters.subcategoriaId, 
        categorias
      );
      if (!t.categoria_id || !categoryIds.includes(t.categoria_id)) return false;
    }
    
    if (filters.contaId && t.conta_id !== filters.contaId) return false;
    if (filters.formaPagamento && t.forma_pagamento !== filters.formaPagamento) return false;
    if (filters.statusPagamento === "pago" && !isExecutado(t.is_pago_executado)) return false;
    if (filters.statusPagamento === "pendente" && !isPendente(t.is_pago_executado)) return false;
    return true;
  });

  const transacoesFiltradasGerais = todasTransacoes.filter((t) => {
    if (filters.tipo && t.tipo !== filters.tipo) return false;
    if (filters.categoriaId || filters.subcategoriaId) {
      const categoryIds = getCategoryIdsForFilter(filters.categoriaId, filters.subcategoriaId, categorias);
      if (!t.categoria_id || !categoryIds.includes(t.categoria_id)) return false;
    }
    if (filters.contaId && t.conta_id !== filters.contaId) return false;
    if (filters.formaPagamento && t.forma_pagamento !== filters.formaPagamento) return false;
    if (filters.statusPagamento === "pago" && t.is_pago_executado !== true) return false;
    if (filters.statusPagamento === "pendente" && t.is_pago_executado !== false) return false;
    return true;
  });

  // Filter valid transactions: exclude transfers and non-executed payments
  const transacoesValidas = transacoesFiltradas.filter(t => 
    t.forma_pagamento !== "transferencia" && 
    isExecutado(t.is_pago_executado)
  );

  const transacoesExecutadasPeriodo = transacoesFiltradas.filter((t) => isExecutado(t.is_pago_executado));

  // For balance calculation, also exclude credit card expenses (they go to invoice, not immediate balance)
  const transacoesParaSaldo = transacoesValidas.filter(t => {
    const conta = contas.find(c => c.id === t.conta_id);
    if (conta?.tipo === "credito" && t.tipo === "despesa") return false;
    return true;
  });

  const totalReceitas = transacoesParaSaldo
    .filter(t => t.tipo === "receita")
    .reduce((acc, t) => acc + Number(t.valor), 0);

  const totalRendimentos = transacoesFiltradas
    .filter((t) => t.tipo === "receita" && t.forma_pagamento === "rendimento" && t.is_pago_executado === true)
    .reduce((acc, t) => acc + Number(t.valor), 0);
  
  const totalDespesas = transacoesParaSaldo
    .filter(t => t.tipo === "despesa")
    .reduce((acc, t) => acc + Number(t.valor), 0);
  
  const saldoMes = totalReceitas - totalDespesas;

  // Calculate "Economia" - entries/transfers to savings accounts (poupanca)
  const contasPoupanca = contas.filter(c => c.tipo === "poupanca");
  const economiaTotal = transacoesFiltradas
    .filter(t => {
      const isEntradaPoupanca = contasPoupanca.some(cp => cp.id === t.conta_id) && t.tipo === "receita";
      return isEntradaPoupanca && isExecutado(t.is_pago_executado);
    })
    .reduce((acc, t) => acc + Number(t.valor), 0);

  const pendenciasPeriodo = transacoesFiltradas.filter(t => 
    t.forma_pagamento !== "transferencia" &&
    isPendente(t.is_pago_executado)
  );

  const receitasPendentes = pendenciasPeriodo
    .filter(t => t.tipo === "receita")
    .reduce((acc, t) => acc + Number(t.valor), 0);

  const despesasPendentes = pendenciasPeriodo
    .filter(t => t.tipo === "despesa")
    .reduce((acc, t) => acc + Number(t.valor), 0);

  const pendenteMes = despesasPendentes - receitasPendentes;
  
  // Only accounts marked to include in total balance (cards always included where applicable)
  const contasIncluidas = useMemo(
    () => contas.filter(c => c.tipo === "credito" || c.incluir_no_saldo !== false),
    [contas]
  );

  // Calculate total account balance using ALL executed transactions (real balance)
  const saldoContas = useMemo(() => {
    return calcularSaldoTotalReal(contasIncluidas, todasTransacoes);
  }, [contasIncluidas, todasTransacoes]);

  // Saldo apenas de contas correntes (exclui crédito, poupança, etc.) — também respeita "incluir no saldo"
  const saldoContasCorrentes = useMemo(() => {
    const contasCorrentes = contasIncluidas.filter(c => c.tipo === "corrente");
    return calcularSaldoTotalReal(contasCorrentes, todasTransacoes);
  }, [contasIncluidas, todasTransacoes]);

  const gastosCartao = useMemo(() => {
    const cartoesCredito = contas.filter(c => c.tipo === "credito");
    return cartoesCredito.reduce((acc, cartao) => {
      return acc + calcularFaturaAbertaCartao(cartao, todasTransacoes, contas);
    }, 0);
  }, [contas, todasTransacoes]);

  // Calculate patrimonial variation using end-of-month comparison with ALL transactions
  const variacaoPatrimonial = useMemo(() => {
    return calcularVariacaoPatrimonial(contasIncluidas, todasTransacoes);
  }, [contasIncluidas, todasTransacoes]);

  // Category aggregation helpers
  const mainCategoriasDesp = categorias.filter(c => c.tipo === "despesa" && !c.categoria_pai_id);
  const getSubcategoriaIds = (mainId: string) => categorias.filter(c => c.categoria_pai_id === mainId).map(c => c.id);

  // Pie chart data: only main categories (subcategories aggregated into parent)
  const despesasPorCategoria = mainCategoriasDesp
    .map(cat => {
      const subcatIds = getSubcategoriaIds(cat.id);
      const allCategoryIds = [cat.id, ...subcatIds];
      const total = transacoesValidas
        .filter(t => t.categoria_id && allCategoryIds.includes(t.categoria_id) && t.tipo === "despesa")
        .reduce((acc, t) => acc + Number(t.valor), 0);
      return { name: cat.nome, value: total, color: cat.cor, categoriaId: cat.id };
    })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const receitasPorCategoria = categorias
    .filter(c => c.tipo === "receita" && !c.categoria_pai_id)
    .map(cat => {
      const subcatIds = getSubcategoriaIds(cat.id);
      const allCategoryIds = [cat.id, ...subcatIds];
      const total = transacoesValidas
        .filter(t => t.categoria_id && allCategoryIds.includes(t.categoria_id) && t.tipo === "receita")
        .reduce((acc, t) => acc + Number(t.valor), 0);
      return { name: cat.nome, value: total, color: cat.cor, categoriaId: cat.id };
    })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  // Drilldown: subcategorias + lançamentos da categoria principal selecionada
  const drilldownData = useMemo(() => {
    if (!drilldown) return null;
    const cat = categorias.find(c => c.id === drilldown.categoriaId);
    if (!cat) return null;
    const subcats = categorias.filter(c => c.categoria_pai_id === cat.id);
    const allIds = [cat.id, ...subcats.map(s => s.id)];

    const subBuckets = [
      ...subcats.map(s => {
        const total = transacoesValidas
          .filter(t => t.categoria_id === s.id && t.tipo === drilldown.tipo)
          .reduce((acc, t) => acc + Number(t.valor), 0);
        return { id: s.id, name: s.nome, color: s.cor, value: total };
      }),
      // Lançamentos diretos na categoria pai (sem subcategoria)
      (() => {
        const total = transacoesValidas
          .filter(t => t.categoria_id === cat.id && t.tipo === drilldown.tipo)
          .reduce((acc, t) => acc + Number(t.valor), 0);
        return { id: cat.id, name: "Sem subcategoria", color: cat.cor, value: total };
      })(),
    ].filter(b => b.value > 0).sort((a, b) => b.value - a.value);

    const lancamentos = transacoesValidas
      .filter(t => t.categoria_id && allIds.includes(t.categoria_id) && t.tipo === drilldown.tipo)
      .map(t => {
        const tcat = categorias.find(c => c.id === t.categoria_id);
        return { ...t, categoriaNome: tcat?.nome || "—", categoriaCor: tcat?.cor };
      })
      .sort((a, b) => (a.data < b.data ? 1 : -1));

    const total = subBuckets.reduce((s, b) => s + b.value, 0);

    return { cat, subBuckets, lancamentos, total };
  }, [drilldown, categorias, transacoesValidas]);


  const renderLegendList = (
    dataList: Array<{ name: string; value: number; color?: string; categoriaId?: string }>,
    onItemClick?: (item: { categoriaId?: string }) => void,
  ) => {
    const total = dataList.reduce((sum, item) => sum + item.value, 0);
    return (
      <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1">
        {dataList.map((item, idx) => {
          const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
          const clickable = !!onItemClick && !!item.categoriaId;
          return (
            <div
              key={`${item.name}-${idx}`}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onItemClick!(item) : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onItemClick!(item); } } : undefined}
              className={`flex items-center justify-between text-xs border rounded-md p-2 gap-2 ${clickable ? "cursor-pointer hover:bg-accent/40 transition-colors" : ""}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || COLORS[idx % COLORS.length] }} />
                <span className="truncate">{item.name}</span>
              </div>
              <span className="font-medium whitespace-nowrap">{formatCurrency(item.value)} ({percent}%)</span>
            </div>
          );
        })}
      </div>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <PageLoadingSkeleton type="dashboard" title="Dashboard Financeiro" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* HERO HEADER */}
        <div className="relative overflow-hidden rounded-2xl gradient-hero border border-border/40 shadow-card">
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full gradient-primary opacity-10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -left-16 w-64 h-64 rounded-full gradient-info opacity-[0.07] blur-3xl pointer-events-none" />
          <div className="relative p-5 sm:p-7 flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
                  <Wallet className="h-6 w-6" />
                </div>
                <div>
                  <p className="section-label mb-1">Visão geral</p>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground leading-tight">
                    Dashboard Financeiro
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Acompanhe suas finanças em tempo real
                  </p>
                </div>
              </div>
              <CustomizeDashboardModal visibility={visibility} onVisibilityChange={setVisibility} />
            </div>

            <AdvancedFilters
              filters={filters}
              onFiltersChange={setFilters}
              onResetToDefault={handleRestoreDefaultFilter}
              categorias={categorias}
              contas={contas}
              showTipo
              showCategoria
              showConta
              showFormaPagamento
              showStatusPagamento
            />
          </div>
        </div>

        {/* SEÇÃO RESUMO */}
        {visibility.kpis && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="section-label">Resumo</p>
              <div className="flex-1 ml-3 h-px bg-border/60" />
            </div>

            {/* Hero KPIs — Saldo Total + Saldo do Mês */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Saldo Total — destaque principal */}
              <Card className="relative overflow-hidden border-0 shadow-card card-hover gradient-primary text-primary-foreground">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
                <CardContent className="relative p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-5 w-5 opacity-90" />
                      <p className="text-xs font-medium uppercase tracking-wider opacity-90">Patrimônio Total</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 opacity-70 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Saldo acumulado de todas as contas considerando todo o histórico de transações executadas.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {variacaoPatrimonial !== null && (
                      <Badge className={`border-0 backdrop-blur-sm ${variacaoPatrimonial >= 0 ? "bg-white/20" : "bg-destructive/40"} text-white text-xs`}>
                        {variacaoPatrimonial >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                        {variacaoPatrimonial >= 0 ? "+" : ""}{variacaoPatrimonial.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-3xl sm:text-4xl font-bold tabular-nums mt-3 tracking-tight">
                    {formatCurrency(saldoContas)}
                  </p>
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/15">
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-wider opacity-75">Conta Corrente</p>
                      <p className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(saldoContasCorrentes)}</p>
                    </div>
                    <div className="w-px h-8 bg-white/20" />
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-wider opacity-75">Poupado</p>
                      <p className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(economiaTotal)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Resultado do Período */}
              <Card className="relative overflow-hidden border-border/50 shadow-card card-hover bg-card">
                <div className={`absolute top-0 left-0 right-0 h-1 ${saldoMes >= 0 ? "gradient-success" : "gradient-danger"}`} />
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-5 w-5 text-muted-foreground" />
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado do Período</p>
                    </div>
                    <Badge variant="outline" className={`text-xs ${saldoMes >= 0 ? "border-success/40 text-success bg-success/10" : "border-destructive/40 text-destructive bg-destructive/10"}`}>
                      {saldoMes >= 0 ? "Superávit" : "Déficit"}
                    </Badge>
                  </div>
                  <p className={`text-3xl sm:text-4xl font-bold tabular-nums mt-3 tracking-tight ${saldoMes >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(saldoMes)}
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border/60">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-success/10">
                        <TrendingUp className="h-3.5 w-3.5 text-success" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Receitas</p>
                        <p className="text-sm font-semibold tabular-nums text-success truncate">{formatCurrency(totalReceitas)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-destructive/10">
                        <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Despesas</p>
                        <p className="text-sm font-semibold tabular-nums text-destructive truncate">{formatCurrency(totalDespesas)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Secondary KPIs — compactos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: "Rendimentos", value: totalRendimentos, icon: HandCoins, color: "emerald", tip: "Total de rendimentos (juros, dividendos, etc.) executados no período." },
                { label: "Pendente", value: pendenteMes, icon: Clock, color: "warning", tip: "Soma líquida das transações pendentes (a pagar menos a receber).", neutral: true },
                { label: "Cartão", value: gastosCartao, icon: CreditCard, color: "destructive", tip: "Faturas em aberto dos cartões de crédito (ciclo fechado pendente + ciclo aberto)." },
                { label: "Poupado", value: economiaTotal, icon: PiggyBank, color: "primary", tip: "Receitas e transferências para contas do tipo Poupança." },
                { label: "Conta Corrente", value: saldoContasCorrentes, icon: Wallet, color: "primary", tip: "Saldo apenas das contas correntes." },
              ].map((kpi) => {
                const Icon = kpi.icon;
                const colorMap: Record<string, { bg: string; text: string; bar: string }> = {
                  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600", bar: "bg-emerald-500" },
                  warning: { bg: "bg-warning/10", text: "text-warning", bar: "bg-warning" },
                  destructive: { bg: "bg-destructive/10", text: "text-destructive", bar: "bg-destructive" },
                  primary: { bg: "bg-primary/10", text: "text-primary", bar: "bg-primary" },
                };
                const c = colorMap[kpi.color];
                const valueColor = kpi.neutral
                  ? (kpi.value <= 0 ? "text-success" : "text-warning")
                  : (kpi.value >= 0 ? c.text : "text-destructive");
                return (
                  <Card key={kpi.label} className="relative overflow-hidden border-border/50 shadow-card card-hover group">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.bar} opacity-80`} />
                    <CardContent className="p-3 sm:p-4 pl-4 sm:pl-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className={`p-1.5 rounded-lg ${c.bg} group-hover:scale-110 transition-transform`}>
                          <Icon className={`h-4 w-4 ${c.text}`} />
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs text-xs">{kpi.tip}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider truncate">{kpi.label}</p>
                      <p className={`text-base sm:text-lg font-bold tabular-nums truncate mt-0.5 ${valueColor}`}>
                        {formatCurrency(kpi.value)}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* SEÇÃO ANÁLISE */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="section-label">Análise</p>
            <div className="flex-1 ml-3 h-px bg-border/60" />
          </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {visibility.graficoCategoria && (
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Despesas por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                {despesasPorCategoria.length > 0 ? (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                      <Pie
                        data={despesasPorCategoria}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        cursor={"pointer"}
                        onClick={(d: any) => {
                          if (d?.categoriaId) {
                            setDrilldown({ tipo: "despesa", categoriaId: d.categoriaId });
                          }
                        }}
                      >
                        {despesasPorCategoria.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const entry = payload[0];
                            const value = entry.value as number;
                            const totalDespesas = despesasPorCategoria.reduce((sum, d) => sum + d.value, 0);
                            const percent = totalDespesas > 0 ? ((value / totalDespesas) * 100).toFixed(1) : '0';
                            return (
                              <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                                <p className="font-medium text-foreground text-sm">{entry.name}</p>
                                <p className="text-sm text-foreground">{formatCurrency(value)}</p>
                                <p className="text-xs text-muted-foreground">{percent}% do total de despesas</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      </PieChart>
                    </ResponsiveContainer>
                    {renderLegendList(
                      despesasPorCategoria,
                      (item) => item.categoriaId && setDrilldown({ tipo: "despesa", categoriaId: item.categoriaId }),
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Sem despesas no período
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {visibility.graficoCategoria && (
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Receitas por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                {receitasPorCategoria.length > 0 ? (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={receitasPorCategoria}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                          cursor={"pointer"}
                          onClick={(d: any) => {
                            if (d?.categoriaId) {
                              setDrilldown({ tipo: "receita", categoriaId: d.categoriaId });
                            }
                          }}
                        >
                          {receitasPorCategoria.map((entry, index) => (
                            <Cell key={`cell-rec-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    {renderLegendList(
                      receitasPorCategoria,
                      (item) => item.categoriaId && setDrilldown({ tipo: "receita", categoriaId: item.categoriaId }),
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Sem receitas no período
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        {visibility.saldoContas && (
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-base">Saldo por Conta</CardTitle>
                  <Select value={saldoContasMode} onValueChange={(v) => setSaldoContasMode(v as "total" | "mes")}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="total">Saldo Total</SelectItem>
                      <SelectItem value="mes">Saldo do Período</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {contas.map((conta) => {
                    const transacoesContaComData = todasTransacoes.filter((t) => t.conta_id === conta.id || t.conta_destino_id === conta.id);

                    // Choose which transactions to use based on mode
                    let saldo = 0;

                    if (saldoContasMode === "total") {
                      if (conta.tipo === "credito") {
                        saldo = calcularFaturaAbertaCartao(conta, todasTransacoes, contas);
                      } else {
                        saldo = calcularSaldoRealConta(conta, todasTransacoes);
                      }
                    } else {
                      if (conta.tipo === "credito") {
                        saldo = calcularFaturaAbertaCartao(conta, todasTransacoes, contas);
                      } else {
                        const transacoesParaCalculo = transacoesExecutadasPeriodo.filter(
                          t => t.conta_id === conta.id || t.conta_destino_id === conta.id
                        );

                        saldo = transacoesParaCalculo.reduce((acc, t) => {
                          const valor = Number(t.valor);
                          const isTransferencia = t.forma_pagamento === "transferencia" || t.tipo === "transferencia";

                          if (isTransferencia) {
                            if (t.conta_destino_id) {
                              if (t.conta_id === conta.id) return acc - valor;
                              if (t.conta_destino_id === conta.id) return acc + valor;
                            }
                            return acc;
                          }

                          if (t.tipo === "receita" && t.conta_id === conta.id) return acc + valor;
                          if (t.tipo === "despesa" && t.conta_id === conta.id) return acc - valor;

                          return acc;
                        }, 0);
                      }
                    }

                    return (
                      <div key={conta.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: conta.cor }}
                          />
                          <div>
                            <p className="font-medium text-foreground">{conta.nome_conta}</p>
                            <p className="text-xs text-muted-foreground capitalize">{conta.tipo}</p>
                          </div>
                        </div>
                        <p className={`font-bold ${saldo >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(saldo)}
                        </p>
                      </div>
                    );
                  })}
                  {contas.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma conta cadastrada
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          </div>
        </section>

        {/* SEÇÃO ATIVIDADE */}
        {(visibility.evolucaoMensal || visibility.ultimasTransacoes || visibility.contasConfirmar || visibility.proximosFechamentos) && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="section-label">Atividade</p>
              <div className="flex-1 ml-3 h-px bg-border/60" />
            </div>

            {visibility.evolucaoMensal && (
              <EvolucaoMensalWidget transacoes={todasTransacoes} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {visibility.ultimasTransacoes && (
                <UltimasTransacoesWidget
                  transacoes={transacoesFiltradasGerais}
                  categorias={categorias}
                  contas={contas}
                />
              )}

              {visibility.contasConfirmar && (
                <ContasConfirmarWidget transacoes={transacoesFiltradasGerais} categorias={categorias} contas={contas} />
              )}
            </div>

            {visibility.proximosFechamentos && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <ProximosFechamentosWidget
                  contas={contas}
                  transacoes={todasTransacoes}
                />
              </div>
            )}
          </section>
        )}
      </div>

      {/* Drilldown subcategorias + lançamentos */}
      <Dialog open={!!drilldown} onOpenChange={(open) => !open && setDrilldown(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {drilldownData?.cat && (
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: drilldownData.cat.cor }}
                />
              )}
              <span className="truncate">{drilldownData?.cat?.nome ?? ""}</span>
            </DialogTitle>
            <DialogDescription>
              {drilldown?.tipo === "despesa" ? "Despesas" : "Receitas"} desta categoria — total {drilldownData ? formatCurrency(drilldownData.total) : ""}
            </DialogDescription>
          </DialogHeader>

          {drilldownData && (
            <div className="flex-1 overflow-y-auto space-y-6 pr-1">
              {drilldownData.subBuckets.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={drilldownData.subBuckets}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {drilldownData.subBuckets.map((entry, index) => (
                          <Cell key={`sub-cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const entry = payload[0];
                            const value = entry.value as number;
                            const percent = drilldownData.total > 0 ? ((value / drilldownData.total) * 100).toFixed(1) : "0";
                            return (
                              <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                                <p className="font-medium text-foreground text-xs">{entry.name}</p>
                                <p className="text-xs text-foreground">{formatCurrency(value)}</p>
                                <p className="text-[10px] text-muted-foreground">{percent}%</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {renderLegendList(drilldownData.subBuckets.map(b => ({ name: b.name, value: b.value, color: b.color })))}
                </div>
              ) : (
                <div className="text-center text-sm text-muted-foreground py-6">
                  Sem subcategorias com lançamentos no período.
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold mb-2">
                  Lançamentos ({drilldownData.lancamentos.length})
                </h4>
                {drilldownData.lancamentos.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-6 border rounded-md">
                    Nenhum lançamento no período.
                  </div>
                ) : (
                  <div className="border rounded-md divide-y">
                    {drilldownData.lancamentos.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: t.categoriaCor || drilldownData.cat.cor }}
                            />
                            <p className="font-medium truncate">{t.descricao || "—"}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(parseISO(t.data), "dd/MM/yyyy", { locale: ptBR })} · {t.categoriaNome}
                          </p>
                        </div>
                        <span className={`font-semibold tabular-nums whitespace-nowrap ${drilldown?.tipo === "despesa" ? "text-destructive" : "text-success"}`}>
                          {formatCurrency(Number(t.valor))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default DashboardFinancas;
