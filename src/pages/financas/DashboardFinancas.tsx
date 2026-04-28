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
  const [categoryViewMode, setCategoryViewMode] = useState<"main" | "sub">("main");
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

  // Pie chart data based on view mode
  const despesasPorCategoria = (categoryViewMode === "main"
    ? mainCategoriasDesp
        .map(cat => {
          const subcatIds = getSubcategoriaIds(cat.id);
          const allCategoryIds = [cat.id, ...subcatIds];
          const total = transacoesValidas
            .filter(t => t.categoria_id && allCategoryIds.includes(t.categoria_id) && t.tipo === "despesa")
            .reduce((acc, t) => acc + Number(t.valor), 0);
          return { name: cat.nome, value: total, color: cat.cor, categoriaId: cat.id };
        })
        .filter(item => item.value > 0)
    : categorias
        .filter(c => c.tipo === "despesa" && !!c.categoria_pai_id)
        .map(cat => {
          const total = transacoesValidas
            .filter(t => t.categoria_id === cat.id && t.tipo === "despesa")
            .reduce((acc, t) => acc + Number(t.valor), 0);
          const parentCat = cat.categoria_pai_id 
            ? categorias.find(c => c.id === cat.categoria_pai_id) 
            : null;
          const displayName = parentCat ? `${parentCat.nome} > ${cat.nome}` : cat.nome;
          return { name: displayName, value: total, color: cat.cor, categoriaId: cat.id };
        })
        .filter(item => item.value > 0)
  ).sort((a, b) => b.value - a.value);

  const receitasPorCategoria = (categoryViewMode === "main"
    ? categorias
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
    : categorias
        .filter(c => c.tipo === "receita" && !!c.categoria_pai_id)
        .map(cat => {
          const total = transacoesValidas
            .filter(t => t.categoria_id === cat.id && t.tipo === "receita")
            .reduce((acc, t) => acc + Number(t.valor), 0);
          const parentCat = cat.categoria_pai_id ? categorias.find(c => c.id === cat.categoria_pai_id) : null;
          const displayName = parentCat ? `${parentCat.nome} > ${cat.nome}` : cat.nome;
          return { name: displayName, value: total, color: cat.cor, categoriaId: cat.id };
        })
        .filter(item => item.value > 0)
  ).sort((a, b) => b.value - a.value);

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
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard Financeiro</h1>
              <p className="text-sm text-muted-foreground">Visão geral das suas finanças</p>
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

        {/* KPIs */}
        {visibility.kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            <Card className="shadow-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-success/10">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Receitas</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Total de receitas executadas no período selecionado, excluindo transferências e transações de cartão de crédito.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-sm sm:text-lg font-bold text-success truncate">{formatCurrency(totalReceitas)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/10">
                    <HandCoins className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Rendimentos</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Total de rendimentos (juros, dividendos, etc.) executados no período selecionado.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-sm sm:text-lg font-bold text-emerald-600 truncate">{formatCurrency(totalRendimentos)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-destructive/10">
                    <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Despesas</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Total de despesas executadas no período selecionado, excluindo transferências e gastos em cartão de crédito.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-sm sm:text-lg font-bold text-destructive truncate">{formatCurrency(totalDespesas)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                    <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Saldo Conta Corrente</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Saldo acumulado apenas das contas correntes, considerando todo o histórico de transações executadas.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className={`text-sm sm:text-lg font-bold truncate ${saldoContasCorrentes >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(saldoContasCorrentes)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-warning/10">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Pendente do Mês</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Soma líquida das transações pendentes no período (a pagar menos a receber).
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className={`text-sm sm:text-lg font-bold truncate ${pendenteMes <= 0 ? "text-success" : "text-warning"}`}>
                      {formatCurrency(pendenteMes)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                    <PiggyBank className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Poupado</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Soma de receitas e transferências para contas do tipo Poupança.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className={`text-sm sm:text-lg font-bold truncate ${economiaTotal > 0 ? "text-success" : "text-muted-foreground"}`}>
                      {formatCurrency(economiaTotal)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                    <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Saldo Total</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Saldo acumulado de todas as contas (corrente + poupança), considerando todo o histórico de transações executadas. A variação compara com o mês anterior.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                      {variacaoPatrimonial !== null && (
                        <Badge 
                          variant="outline" 
                          className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 h-3.5 sm:h-4 ${
                            variacaoPatrimonial >= 0 
                              ? "border-success/50 text-success bg-success/10" 
                              : "border-destructive/50 text-destructive bg-destructive/10"
                          }`}
                        >
                          {variacaoPatrimonial >= 0 ? "+" : ""}{variacaoPatrimonial.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm sm:text-lg font-bold text-foreground truncate">{formatCurrency(saldoContas)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-warning/10">
                    <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Cartão</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Valor total das faturas em aberto dos cartões de crédito (ciclo fechado pendente + ciclo aberto atual).
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-sm sm:text-lg font-bold text-warning truncate">{formatCurrency(gastosCartao)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {visibility.graficoCategoria && (
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-base">Despesas por Categoria</CardTitle>
                  <Select value={categoryViewMode} onValueChange={(v) => setCategoryViewMode(v as "main" | "sub")}>
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">Categorias Principais</SelectItem>
                      <SelectItem value="sub">Subcategorias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                        cursor={categoryViewMode === "main" ? "pointer" : "default"}
                        onClick={(d: any) => {
                          if (categoryViewMode === "main" && d?.categoriaId) {
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
                      categoryViewMode === "main"
                        ? (item) => item.categoriaId && setDrilldown({ tipo: "despesa", categoriaId: item.categoriaId })
                        : undefined,
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
                          cursor={categoryViewMode === "main" ? "pointer" : "default"}
                          onClick={(d: any) => {
                            if (categoryViewMode === "main" && d?.categoriaId) {
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
                    {renderLegendList(receitasPorCategoria)}
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

        {/* Monthly Evolution Widget */}
        {visibility.evolucaoMensal && (
          <EvolucaoMensalWidget transacoes={todasTransacoes} />
        )}

        {/* New Widgets Row */}
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

        {/* Credit Card Widget */}
        {visibility.proximosFechamentos && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <ProximosFechamentosWidget 
              contas={contas} 
              transacoes={todasTransacoes} 
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default DashboardFinancas;
