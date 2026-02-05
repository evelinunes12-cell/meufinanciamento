import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, CreditCard, ArrowUpDown, Info } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { useState, useMemo } from "react";
import { AdvancedFilters, FilterState, getInitialFilterState, getDateRangeFromFilters, getCategoryIdsForFilter } from "@/components/AdvancedFilters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomizeDashboardModal, useWidgetVisibility } from "@/components/dashboard/DashboardWidgets";
import { UltimasTransacoesWidget } from "@/components/dashboard/UltimasTransacoesWidget";
import { ContasConfirmarWidget } from "@/components/dashboard/ContasConfirmarWidget";
import { EvolucaoMensalWidget } from "@/components/dashboard/EvolucaoMensalWidget";
import { ProximosFechamentosWidget } from "@/components/dashboard/ProximosFechamentosWidget";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  categoria_id: string | null;
  conta_id: string;
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

  // Also fetch previous month data for comparison
  const prevMonthStart = format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd");
  const prevMonthEnd = format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd");

  const [transacoesRes, contasRes, categoriasRes, prevMonthRes, todasTransacoesRes] = await Promise.all([
    supabase
      .from("transacoes")
      .select("*")
      .gte("data", startDate)
      .lte("data", endDate)
      .order("data", { ascending: false }),
    supabase.from("contas").select("*"),
    supabase.from("categorias").select("*"),
    supabase
      .from("transacoes")
      .select("*")
      .gte("data", prevMonthStart)
      .lte("data", prevMonthEnd),
    // Fetch all transactions for total balance calculation
    supabase
      .from("transacoes")
      .select("id, valor, tipo, conta_id, forma_pagamento, is_pago_executado"),
  ]);

  return {
    transacoes: (transacoesRes.data || []) as Transacao[],
    contas: (contasRes.data || []) as Conta[],
    categorias: (categoriasRes.data || []) as Categoria[],
    transacoesMesAnterior: (prevMonthRes.data || []) as Transacao[],
    todasTransacoes: (todasTransacoesRes.data || []) as Pick<Transacao, 'id' | 'valor' | 'tipo' | 'conta_id' | 'forma_pagamento' | 'is_pago_executado'>[],
  };
}

const DashboardFinancas = () => {
  const { user } = useAuth();
  const { visibility, setVisibility } = useWidgetVisibility();
  const [filters, setFilters] = useState<FilterState>(getInitialFilterState);
  const [categoryViewMode, setCategoryViewMode] = useState<"main" | "all">("main");
  const [saldoContasMode, setSaldoContasMode] = useState<"total" | "mes">("total");

  const { startDate, endDate } = getDateRangeFromFilters(filters);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-financas", user?.id, startDate, endDate],
    queryFn: () => fetchDashboardData(user?.id, startDate, endDate),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const transacoes = data?.transacoes || [];
  const contas = data?.contas || [];
  const categorias = data?.categorias || [];
  const transacoesMesAnterior = data?.transacoesMesAnterior || [];
  const todasTransacoes = data?.todasTransacoes || [];

  // Apply client-side filters
  const transacoesFiltradas = transacoes.filter((t) => {
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
    if (filters.statusPagamento === "pago" && t.is_pago_executado !== true) return false;
    if (filters.statusPagamento === "pendente" && t.is_pago_executado !== false) return false;
    return true;
  });

  // Filter valid transactions: exclude transfers and non-executed payments
  const transacoesValidas = transacoesFiltradas.filter(t => 
    t.forma_pagamento !== "transferencia" && 
    t.is_pago_executado !== false
  );

  // For balance calculation, also exclude credit card expenses (they go to invoice, not immediate balance)
  const transacoesParaSaldo = transacoesValidas.filter(t => {
    const conta = contas.find(c => c.id === t.conta_id);
    if (conta?.tipo === "credito" && t.tipo === "despesa") return false;
    return true;
  });

  const totalReceitas = transacoesParaSaldo
    .filter(t => t.tipo === "receita")
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
      return isEntradaPoupanca && t.is_pago_executado !== false;
    })
    .reduce((acc, t) => acc + Number(t.valor), 0);

  // Calculate total account balance
  const saldoContas = contas.reduce((acc, conta) => {
    if (conta.tipo === "credito") return acc;
    
    const transacoesConta = transacoesValidas.filter(t => t.conta_id === conta.id);
    const receitas = transacoesConta.filter(t => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
    const despesas = transacoesConta.filter(t => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
    return acc + Number(conta.saldo_inicial) + receitas - despesas;
  }, 0);

  const gastosCartao = transacoesValidas.filter(t => {
    const conta = contas.find(c => c.id === t.conta_id);
    return conta?.tipo === "credito" && t.tipo === "despesa";
  }).reduce((acc, t) => acc + Number(t.valor), 0);

  // Calculate previous month balance for comparison
  const variacaoPatrimonial = useMemo(() => {
    const transacoesMesAnteriorValidas = transacoesMesAnterior.filter(t => 
      t.forma_pagamento !== "transferencia" && t.is_pago_executado !== false
    );

    const saldoMesAnterior = contas.reduce((acc, conta) => {
      if (conta.tipo === "credito") return acc;
      const transacoesConta = transacoesMesAnteriorValidas.filter(t => t.conta_id === conta.id);
      const receitas = transacoesConta.filter(t => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
      const despesas = transacoesConta.filter(t => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
      return acc + Number(conta.saldo_inicial) + receitas - despesas;
    }, 0);

    if (saldoMesAnterior === 0) return null;
    const variacao = ((saldoContas - saldoMesAnterior) / Math.abs(saldoMesAnterior)) * 100;
    return variacao;
  }, [saldoContas, contas, transacoesMesAnterior]);

  // Category aggregation helpers
  const mainCategoriasDesp = categorias.filter(c => c.tipo === "despesa" && !c.categoria_pai_id);
  const getSubcategoriaIds = (mainId: string) => categorias.filter(c => c.categoria_pai_id === mainId).map(c => c.id);

  // Pie chart data based on view mode
  const despesasPorCategoria = categoryViewMode === "main"
    ? mainCategoriasDesp
        .map(cat => {
          const subcatIds = getSubcategoriaIds(cat.id);
          const allCategoryIds = [cat.id, ...subcatIds];
          const total = transacoesValidas
            .filter(t => t.categoria_id && allCategoryIds.includes(t.categoria_id) && t.tipo === "despesa")
            .reduce((acc, t) => acc + Number(t.valor), 0);
          return { name: cat.nome, value: total, color: cat.cor };
        })
        .filter(item => item.value > 0)
    : categorias
        .filter(c => c.tipo === "despesa")
        .map(cat => {
          const total = transacoesValidas
            .filter(t => t.categoria_id === cat.id && t.tipo === "despesa")
            .reduce((acc, t) => acc + Number(t.valor), 0);
          const parentCat = cat.categoria_pai_id 
            ? categorias.find(c => c.id === cat.categoria_pai_id) 
            : null;
          const displayName = parentCat ? `${parentCat.nome} > ${cat.nome}` : cat.nome;
          return { name: displayName, value: total, color: cat.cor };
        })
        .filter(item => item.value > 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dashboard Financeiro</h1>
              <p className="text-muted-foreground">Visão geral das suas finanças</p>
            </div>
            <CustomizeDashboardModal visibility={visibility} onVisibilityChange={setVisibility} />
          </div>
          
          <AdvancedFilters
            filters={filters}
            onFiltersChange={setFilters}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/10">
                    <TrendingUp className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Receitas</p>
                    <p className="text-lg font-bold text-success">{formatCurrency(totalReceitas)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Despesas</p>
                    <p className="text-lg font-bold text-destructive">{formatCurrency(totalDespesas)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <ArrowUpDown className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saldo do Período</p>
                    <p className={`text-lg font-bold ${saldoMes >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(saldoMes)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <PiggyBank className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <p className="text-xs text-muted-foreground">Economia (Poupança)</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Soma de receitas e transferências para contas do tipo Poupança.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className={`text-lg font-bold ${economiaTotal > 0 ? "text-success" : "text-muted-foreground"}`}>
                      {formatCurrency(economiaTotal)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Wallet className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">Saldo Contas</p>
                      {variacaoPatrimonial !== null && (
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] px-1.5 py-0 h-4 ${
                            variacaoPatrimonial >= 0 
                              ? "border-success/50 text-success bg-success/10" 
                              : "border-destructive/50 text-destructive bg-destructive/10"
                          }`}
                        >
                          {variacaoPatrimonial >= 0 ? "+" : ""}{variacaoPatrimonial.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-lg font-bold text-foreground">{formatCurrency(saldoContas)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <CreditCard className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cartão</p>
                    <p className="text-lg font-bold text-warning">{formatCurrency(gastosCartao)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {visibility.graficoCategoria && (
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-base">Despesas por Categoria</CardTitle>
                  <Select value={categoryViewMode} onValueChange={(v) => setCategoryViewMode(v as "main" | "all")}>
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">Categorias Principais</SelectItem>
                      <SelectItem value="all">Todas as Categorias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {despesasPorCategoria.length > 0 ? (
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
                      >
                        {despesasPorCategoria.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Sem despesas no período
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
                    // Choose which transactions to use based on mode
                    const transacoesParaCalculo = saldoContasMode === "total"
                      ? todasTransacoes.filter(t => 
                          t.conta_id === conta.id && 
                          t.forma_pagamento !== "transferencia" && 
                          t.is_pago_executado !== false
                        )
                      : transacoesValidas.filter(t => t.conta_id === conta.id);
                    
                    const receitas = transacoesParaCalculo.filter(t => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
                    const despesas = transacoesParaCalculo.filter(t => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
                    
                    // For total mode, include initial balance; for period mode, show only period movement
                    const saldo = saldoContasMode === "total"
                      ? Number(conta.saldo_inicial) + receitas - despesas
                      : receitas - despesas;

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
          <EvolucaoMensalWidget transacoes={transacoes} />
        )}

        {/* New Widgets Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {visibility.ultimasTransacoes && (
            <UltimasTransacoesWidget 
              transacoes={transacoesFiltradas} 
              categorias={categorias} 
            />
          )}

          {visibility.contasConfirmar && (
            <ContasConfirmarWidget transacoes={transacoesFiltradas} />
          )}
        </div>

        {/* Credit Card Widget */}
        {visibility.proximosFechamentos && (
          <ProximosFechamentosWidget 
            contas={contas} 
            transacoes={transacoes} 
          />
        )}
      </div>
    </AppLayout>
  );
};

export default DashboardFinancas;
