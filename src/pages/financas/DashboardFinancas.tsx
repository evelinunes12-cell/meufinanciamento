import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, CreditCard, ArrowUpDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, startOfQuarter, endOfQuarter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useState } from "react";

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  categoria_id: string | null;
  conta_id: string;
  forma_pagamento: string;
  is_pago_executado: boolean | null;
}

interface Conta {
  id: string;
  nome_conta: string;
  saldo_inicial: number;
  tipo: string;
  cor: string;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  cor: string;
}

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

async function fetchDashboardData(userId: string | undefined, periodo: string) {
  if (!userId) return null;

  const getDateRange = () => {
    const now = new Date();
    switch (periodo) {
      case "mes":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "trimestre":
        return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "semestre":
        return { start: subMonths(startOfMonth(now), 5), end: endOfMonth(now) };
      case "ano":
        return { start: startOfYear(now), end: endOfYear(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const { start, end } = getDateRange();

  const [transacoesRes, contasRes, categoriasRes] = await Promise.all([
    supabase
      .from("transacoes")
      .select("*")
      .gte("data", format(start, "yyyy-MM-dd"))
      .lte("data", format(end, "yyyy-MM-dd"))
      .order("data", { ascending: false }),
    supabase.from("contas").select("*"),
    supabase.from("categorias").select("*"),
  ]);

  return {
    transacoes: (transacoesRes.data || []) as Transacao[],
    contas: (contasRes.data || []) as Conta[],
    categorias: (categoriasRes.data || []) as Categoria[],
  };
}

const DashboardFinancas = () => {
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState("mes");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-financas", user?.id, periodo],
    queryFn: () => fetchDashboardData(user?.id, periodo),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const transacoes = data?.transacoes || [];
  const contas = data?.contas || [];
  const categorias = data?.categorias || [];

  // Filter valid transactions: exclude transfers and non-executed payments
  const transacoesValidas = transacoes.filter(t => 
    t.forma_pagamento !== "transferencia" && 
    t.forma_pagamento !== "transferencia_entre_contas" &&
    t.is_pago_executado !== false
  );

  const totalReceitas = transacoesValidas
    .filter(t => t.tipo === "receita")
    .reduce((acc, t) => acc + Number(t.valor), 0);
  
  const totalDespesas = transacoesValidas
    .filter(t => t.tipo === "despesa")
    .reduce((acc, t) => acc + Number(t.valor), 0);
  
  const saldoMes = totalReceitas - totalDespesas;

  const saldoContas = contas.reduce((acc, conta) => {
    const transacoesConta = transacoesValidas.filter(t => t.conta_id === conta.id);
    const receitas = transacoesConta.filter(t => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
    const despesas = transacoesConta.filter(t => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
    return acc + Number(conta.saldo_inicial) + receitas - despesas;
  }, 0);

  const gastosCartao = transacoesValidas.filter(t => {
    const conta = contas.find(c => c.id === t.conta_id);
    return conta?.tipo === "credito" && t.tipo === "despesa";
  }).reduce((acc, t) => acc + Number(t.valor), 0);

  const despesasPorCategoria = categorias
    .filter(c => c.tipo === "despesa")
    .map(cat => {
      const total = transacoesValidas
        .filter(t => t.categoria_id === cat.id && t.tipo === "despesa")
        .reduce((acc, t) => acc + Number(t.valor), 0);
      return { name: cat.nome, value: total, color: cat.cor };
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard Financeiro</h1>
            <p className="text-muted-foreground">Visão geral das suas finanças</p>
          </div>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Este Mês</SelectItem>
              <SelectItem value="trimestre">Trimestre</SelectItem>
              <SelectItem value="semestre">Semestre</SelectItem>
              <SelectItem value="ano">Este Ano</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
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
                  <p className="text-xs text-muted-foreground">Saldo do Mês</p>
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
                  <p className="text-xs text-muted-foreground">Economia</p>
                  <p className={`text-lg font-bold ${saldoMes >= 0 ? "text-success" : "text-destructive"}`}>
                    {saldoMes > 0 ? formatCurrency(saldoMes) : "R$ 0,00"}
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
                <div>
                  <p className="text-xs text-muted-foreground">Saldo Contas</p>
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

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Despesas por Categoria</CardTitle>
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
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
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

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Saldo por Conta</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {contas.map((conta) => {
                  const transacoesConta = transacoesValidas.filter(t => t.conta_id === conta.id);
                  const receitas = transacoesConta.filter(t => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
                  const despesas = transacoesConta.filter(t => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
                  const saldo = Number(conta.saldo_inicial) + receitas - despesas;

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
        </div>
      </div>
    </AppLayout>
  );
};

export default DashboardFinancas;
