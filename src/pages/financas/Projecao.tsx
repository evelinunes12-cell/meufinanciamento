import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, Calendar, AlertCircle, Wallet, PiggyBank } from "lucide-react";
import { format, addMonths, startOfMonth, endOfMonth, parseISO, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { isExecutado, calcularSaldoTotalReal, getDataEfetiva } from "@/lib/transactions";

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  data_pagamento: string | null;
  descricao: string | null;
  is_pago_executado: boolean | null;
  forma_pagamento: string;
  recorrencia: string | null;
  conta_id: string;
}

interface Conta {
  id: string;
  nome_conta: string;
  saldo_inicial: number;
  tipo: string;
  cor: string;
  dia_fechamento: number | null;
}

async function fetchProjecaoData(userId: string | undefined) {
  if (!userId) return null;

  const [transacoesRes, contasRes] = await Promise.all([
    supabase.from("transacoes").select("*").order("data", { ascending: true }),
    supabase.from("contas").select("*"),
  ]);

  return {
    transacoes: (transacoesRes.data || []) as Transacao[],
    contas: (contasRes.data || []) as Conta[],
  };
}

const Projecao = () => {
  const { user } = useAuth();
  const [mesesProjecao, setMesesProjecao] = useState<number>(3);

  const { data, isLoading } = useQuery({
    queryKey: ["projecao", user?.id],
    queryFn: () => fetchProjecaoData(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const transacoes = data?.transacoes || [];
  const contas = data?.contas || [];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  // Calculate current balance (saldo atual) using helper
  const saldoAtual = useMemo(() => {
    const transacoesParaCalculo = transacoes.map(t => ({
      valor: t.valor,
      tipo: t.tipo,
      conta_id: t.conta_id,
      forma_pagamento: t.forma_pagamento,
      is_pago_executado: t.is_pago_executado,
      data: t.data
    }));
    
    return calcularSaldoTotalReal(contas, transacoesParaCalculo);
  }, [contas, transacoes]);

  // Identify recurring transactions
  const transacoesRecorrentes = useMemo(() => {
    return transacoes.filter(t => 
      t.recorrencia && 
      t.recorrencia !== "unica" && 
      t.forma_pagamento !== "transferencia"
    );
  }, [transacoes]);

  // Project future months
  const projecaoMensal = useMemo(() => {
    const hoje = new Date();
    const meses: Array<{
      mes: Date;
      label: string;
      receitas: number;
      despesas: number;
      saldo: number;
      saldoAcumulado: number;
      transacoes: Array<{ descricao: string; valor: number; tipo: string }>;
    }> = [];

    let saldoAcumulado = saldoAtual;

    // Get pending transactions for current month - use effective date for credit cards
    const inicioMesAtual = startOfMonth(hoje);
    const fimMesAtual = endOfMonth(hoje);
    const inicioMesAtualStr = format(inicioMesAtual, "yyyy-MM-dd");
    const fimMesAtualStr = format(fimMesAtual, "yyyy-MM-dd");

    const pendentesMesAtual = transacoes.filter(t => {
      const dataEfetiva = getDataEfetiva(t, contas);
      const dataEfetivaDate = parseISO(dataEfetiva);
      return (
        t.is_pago_executado === false &&
        t.forma_pagamento !== "transferencia" &&
        !isBefore(dataEfetivaDate, inicioMesAtual) &&
        !isAfter(dataEfetivaDate, fimMesAtual)
      );
    });

    for (let i = 0; i <= mesesProjecao; i++) {
      const mes = addMonths(hoje, i);
      const inicioMes = startOfMonth(mes);
      const fimMes = endOfMonth(mes);

      let receitas = 0;
      let despesas = 0;
      const transacoesMes: Array<{ descricao: string; valor: number; tipo: string }> = [];

      if (i === 0) {
        // Current month: use pending transactions
        pendentesMesAtual.forEach(t => {
          const valor = Number(t.valor);
          if (t.tipo === "receita") {
            receitas += valor;
          } else {
            despesas += valor;
          }
          transacoesMes.push({
            descricao: t.descricao || "Sem descrição",
            valor,
            tipo: t.tipo,
          });
        });
      } else {
        // Future months: use recurring transactions
        transacoesRecorrentes.forEach(t => {
          const valor = Number(t.valor);
          if (t.tipo === "receita") {
            receitas += valor;
          } else {
            despesas += valor;
          }
          transacoesMes.push({
            descricao: t.descricao || "Sem descrição",
            valor,
            tipo: t.tipo,
          });
        });
      }

      const saldo = receitas - despesas;
      saldoAcumulado += saldo;

      meses.push({
        mes,
        label: format(mes, "MMM/yy", { locale: ptBR }),
        receitas,
        despesas,
        saldo,
        saldoAcumulado,
        transacoes: transacoesMes,
      });
    }

    return meses;
  }, [transacoes, transacoesRecorrentes, saldoAtual, mesesProjecao]);

  // Chart data
  const chartData = projecaoMensal.map(m => ({
    name: m.label,
    receitas: m.receitas,
    despesas: m.despesas,
    saldo: m.saldoAcumulado,
  }));

  const saldoFinal = projecaoMensal[projecaoMensal.length - 1]?.saldoAcumulado || 0;
  const menorSaldo = Math.min(...projecaoMensal.map(m => m.saldoAcumulado));
  const haRiscoNegativo = menorSaldo < 0;

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
            <h1 className="text-2xl font-bold text-foreground">Projeção de Saldo</h1>
            <p className="text-muted-foreground">Simule como estará seu saldo nos próximos meses</p>
          </div>
          <Select value={mesesProjecao.toString()} onValueChange={(v) => setMesesProjecao(Number(v))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Próximos 3 meses</SelectItem>
              <SelectItem value="6">Próximos 6 meses</SelectItem>
              <SelectItem value="12">Próximos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo Atual</p>
                  <p className={`text-lg font-bold ${saldoAtual >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(saldoAtual)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <PiggyBank className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo Projetado ({mesesProjecao}m)</p>
                  <p className={`text-lg font-bold ${saldoFinal >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(saldoFinal)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Receitas Recorrentes</p>
                  <p className="text-lg font-bold text-success">
                    {formatCurrency(
                      transacoesRecorrentes
                        .filter(t => t.tipo === "receita")
                        .reduce((a, t) => a + Number(t.valor), 0)
                    )}
                  </p>
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
                  <p className="text-xs text-muted-foreground">Despesas Fixas</p>
                  <p className="text-lg font-bold text-destructive">
                    {formatCurrency(
                      transacoesRecorrentes
                        .filter(t => t.tipo === "despesa")
                        .reduce((a, t) => a + Number(t.valor), 0)
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alert for negative balance */}
        {haRiscoNegativo && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Atenção: Risco de saldo negativo</p>
                  <p className="text-sm text-muted-foreground">
                    A projeção indica que o saldo pode ficar negativo em{" "}
                    {formatCurrency(menorSaldo)}. Considere revisar suas despesas fixas.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chart */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Evolução do Saldo Projetado</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis 
                  tickFormatter={(value) => formatCurrency(value).replace("R$", "")}
                  className="text-xs"
                />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Legend />
                <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {projecaoMensal.map((mes, index) => (
            <Card key={index} className={`shadow-card ${mes.saldoAcumulado < 0 ? "border-destructive/50" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {format(mes.mes, "MMMM yyyy", { locale: ptBR })}
                  </CardTitle>
                  {index === 0 && (
                    <Badge variant="secondary" className="text-xs">Atual</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-success/10 text-center">
                    <p className="text-xs text-muted-foreground">Receitas</p>
                    <p className="text-sm font-bold text-success">+{formatCurrency(mes.receitas)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-destructive/10 text-center">
                    <p className="text-xs text-muted-foreground">Despesas</p>
                    <p className="text-sm font-bold text-destructive">-{formatCurrency(mes.despesas)}</p>
                  </div>
                </div>

                <div className={`p-3 rounded-lg ${mes.saldoAcumulado >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Saldo Acumulado</span>
                    <span className={`font-bold ${mes.saldoAcumulado >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(mes.saldoAcumulado)}
                    </span>
                  </div>
                </div>

                {mes.transacoes.length > 0 && (
                  <ScrollArea className="h-[100px]">
                    <div className="space-y-1">
                      {mes.transacoes.slice(0, 5).map((t, i) => (
                        <div key={i} className="flex justify-between text-xs p-1.5 rounded bg-muted/30">
                          <span className="truncate flex-1">{t.descricao}</span>
                          <span className={t.tipo === "receita" ? "text-success" : "text-destructive"}>
                            {t.tipo === "receita" ? "+" : "-"}{formatCurrency(t.valor)}
                          </span>
                        </div>
                      ))}
                      {mes.transacoes.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{mes.transacoes.length - 5} transações
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Projecao;
