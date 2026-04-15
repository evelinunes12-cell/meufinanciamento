import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, AlertCircle, CreditCard, Info, BarChart3, Target } from "lucide-react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  parseISO, isBefore, isAfter
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, ReferenceLine
} from "recharts";
import {
  isExecutado, calcularSaldoRealConta, getDataEfetiva
} from "@/lib/transactions";

// ==========================================
// Types
// ==========================================

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
  conta_destino_id?: string | null;
  parcela_atual?: number | null;
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

interface Orcamento {
  id: string;
  categoria_id: string;
  valor_limite: number;
  mes_referencia: string;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  categoria_pai_id: string | null;
}

interface DadosMes {
  mes: Date;
  label: string;
  receitas: number;
  despesasLancadas: number;
  despesasProjetadas: number;
  fonteProjecao: "lancadas" | "orcamento" | "media";
  saldoAcumulado: number;
}

type Cenario = "otimista" | "realista" | "pessimista";

const CENARIO_CONFIG: Record<Cenario, { label: string; fator: number; cor: string; descricao: string }> = {
  otimista: { label: "Otimista", fator: -0.15, cor: "hsl(var(--success))", descricao: "Despesas 15% abaixo da projeção base" },
  realista: { label: "Realista", fator: 0, cor: "hsl(var(--primary))", descricao: "Projeção base sem ajustes" },
  pessimista: { label: "Pessimista", fator: 0.20, cor: "hsl(var(--destructive))", descricao: "Despesas 20% acima da projeção base" },
};

// ==========================================
// Data Fetching
// ==========================================

async function fetchProjecaoData(userId: string | undefined) {
  if (!userId) return null;

  const [transacoesRes, contasRes, orcamentosRes, categoriasRes] = await Promise.all([
    supabase.from("transacoes").select("*").order("data", { ascending: true }),
    supabase.from("contas").select("*"),
    supabase.from("orcamentos").select("*"),
    supabase.from("categorias").select("*"),
  ]);

  return {
    transacoes: (transacoesRes.data || []) as Transacao[],
    contas: (contasRes.data || []) as Conta[],
    orcamentos: (orcamentosRes.data || []) as Orcamento[],
    categorias: (categoriasRes.data || []) as Categoria[],
  };
}

// ==========================================
// Helpers
// ==========================================

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

function getDataEfetivaStr(t: Transacao, contas: Conta[]): string {
  return getDataEfetiva(
    { data: t.data, data_pagamento: t.data_pagamento, conta_id: t.conta_id },
    contas
  );
}

// ==========================================
// Component
// ==========================================

const Projecao = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["projecao-smart", user?.id],
    queryFn: () => fetchProjecaoData(user?.id),
    enabled: !!user?.id,
    staleTime: 0,
  });

  const [cenario, setCenario] = useState<Cenario>("realista");

  const transacoes = data?.transacoes || [];
  const contas = data?.contas || [];
  const orcamentos = data?.orcamentos || [];

  // Filter out transfers globally
  const transacoesSemTransf = useMemo(
    () => transacoes.filter(t => t.forma_pagamento !== "transferencia"),
    [transacoes]
  );

  // ==========================================
  // OBJECTIVE 1: Saldo Real Atual
  // ==========================================
  const saldoAtual = useMemo(() => {
    const contasAtivo = contas.filter(c => c.tipo !== "credito");
    const mapped = transacoes.map(t => ({
      valor: t.valor, tipo: t.tipo, conta_id: t.conta_id,
      conta_destino_id: t.conta_destino_id,
      forma_pagamento: t.forma_pagamento,
      is_pago_executado: t.is_pago_executado, data: t.data,
    }));
    return contasAtivo.reduce((acc, c) => acc + calcularSaldoRealConta(c, mapped), 0);
  }, [contas, transacoes]);

  // ==========================================
  // OBJECTIVE 1: Média Histórica (últimos 3 meses fechados)
  // ==========================================
  const mediaHistorica = useMemo(() => {
    const hoje = new Date();
    const mesesFechados: number[] = [];

    for (let i = 1; i <= 3; i++) {
      const mes = subMonths(hoje, i);
      const inicio = startOfMonth(mes);
      const fim = endOfMonth(mes);

      const despesasMes = transacoesSemTransf
        .filter(t => {
          if (t.tipo !== "despesa") return false;
          if (!isExecutado(t.is_pago_executado)) return false;
          const de = parseISO(getDataEfetivaStr(t, contas));
          return !isBefore(de, inicio) && !isAfter(de, fim);
        })
        .reduce((acc, t) => acc + Number(t.valor), 0);

      mesesFechados.push(despesasMes);
    }

    const total = mesesFechados.reduce((a, b) => a + b, 0);
    return mesesFechados.some(v => v > 0) ? total / mesesFechados.filter(v => v > 0).length : 0;
  }, [transacoesSemTransf, contas]);

  // ==========================================
  // Total de orçamentos (soma de todos os limites vigentes)
  // ==========================================
  const totalOrcamentos = useMemo(() => {
    if (orcamentos.length === 0) return 0;
    // Get the latest month reference available
    const hoje = new Date();
    const mesAtualStr = format(startOfMonth(hoje), "yyyy-MM-dd");
    // Try current month first, then any
    let orcamentosMes = orcamentos.filter(o => o.mes_referencia === mesAtualStr);
    if (orcamentosMes.length === 0) {
      // Use most recent month
      const sorted = [...orcamentos].sort((a, b) => b.mes_referencia.localeCompare(a.mes_referencia));
      const latestMonth = sorted[0]?.mes_referencia;
      orcamentosMes = orcamentos.filter(o => o.mes_referencia === latestMonth);
    }
    return orcamentosMes.reduce((acc, o) => acc + Number(o.valor_limite), 0);
  }, [orcamentos]);

  // ==========================================
  // OBJECTIVE 2: Projeção base (receitas e despesas por mês)
  // ==========================================
  const projecaoBase = useMemo(() => {
    const hoje = new Date();
    const meses: { mes: Date; label: string; receitas: number; despesasLancadas: number; despesasBase: number; fonteProjecao: DadosMes["fonteProjecao"] }[] = [];

    for (let i = 0; i < 6; i++) {
      const mes = addMonths(hoje, i);
      const inicio = startOfMonth(mes);
      const fim = endOfMonth(mes);

      const receitas = transacoesSemTransf
        .filter(t => {
          if (t.tipo !== "receita") return false;
          const de = parseISO(getDataEfetivaStr(t, contas));
          return !isBefore(de, inicio) && !isAfter(de, fim);
        })
        .reduce((acc, t) => acc + Number(t.valor), 0);

      const despesasLancadas = transacoesSemTransf
        .filter(t => {
          if (t.tipo !== "despesa") return false;
          const de = parseISO(getDataEfetivaStr(t, contas));
          return !isBefore(de, inicio) && !isAfter(de, fim);
        })
        .reduce((acc, t) => acc + Number(t.valor), 0);

      const candidatos = [
        { valor: despesasLancadas, fonte: "lancadas" as const },
        { valor: totalOrcamentos, fonte: "orcamento" as const },
        { valor: mediaHistorica, fonte: "media" as const },
      ];
      const melhor = candidatos.reduce((a, b) => (b.valor > a.valor ? b : a));

      const despesasBase = i === 0 ? despesasLancadas : melhor.valor;
      const fonteProjecao = i === 0 ? "lancadas" as const : melhor.fonte;

      meses.push({ mes, label: format(mes, "MMM/yy", { locale: ptBR }), receitas, despesasLancadas, despesasBase, fonteProjecao });
    }
    return meses;
  }, [transacoesSemTransf, contas, totalOrcamentos, mediaHistorica]);

  // Build projection for a given scenario
  const buildProjecao = (fator: number): DadosMes[] => {
    let saldoAcumulado = saldoAtual;
    return projecaoBase.map((m, i) => {
      const despesasProjetadas = i === 0 ? m.despesasBase : m.despesasBase * (1 + fator);
      saldoAcumulado = saldoAcumulado + m.receitas - despesasProjetadas;
      return {
        mes: m.mes, label: m.label, receitas: m.receitas,
        despesasLancadas: m.despesasLancadas, despesasProjetadas,
        fonteProjecao: m.fonteProjecao, saldoAcumulado,
      };
    });
  };

  const projecaoOtimista = useMemo(() => buildProjecao(CENARIO_CONFIG.otimista.fator), [projecaoBase, saldoAtual]);
  const projecaoRealista = useMemo(() => buildProjecao(CENARIO_CONFIG.realista.fator), [projecaoBase, saldoAtual]);
  const projecaoPessimista = useMemo(() => buildProjecao(CENARIO_CONFIG.pessimista.fator), [projecaoBase, saldoAtual]);

  const projecaoMensal = cenario === "otimista" ? projecaoOtimista : cenario === "pessimista" ? projecaoPessimista : projecaoRealista;

  // ==========================================
  // Radar de Faturas (próximos 3 meses por cartão)
  // ==========================================
  const radarFaturas = useMemo(() => {
    const cartoes = contas.filter(c => c.tipo === "credito");
    if (cartoes.length === 0) return [];

    const hoje = new Date();
    return cartoes.map(cartao => {
      const meses: { label: string; valor: number }[] = [];

      for (let i = 0; i < 3; i++) {
        const mes = addMonths(hoje, i);
        const inicio = startOfMonth(mes);
        const fim = endOfMonth(mes);

        const valorFatura = transacoesSemTransf
          .filter(t => {
            if (t.conta_id !== cartao.id) return false;
            if (t.tipo !== "despesa") return false;
            const de = parseISO(getDataEfetivaStr(t, contas));
            return !isBefore(de, inicio) && !isAfter(de, fim);
          })
          .reduce((acc, t) => acc + Number(t.valor), 0);

        meses.push({
          label: format(mes, "MMM/yy", { locale: ptBR }),
          valor: valorFatura,
        });
      }

      return { cartao, meses };
    });
  }, [contas, transacoesSemTransf]);

  // Derived
  const saldoFinal = projecaoMensal[projecaoMensal.length - 1]?.saldoAcumulado ?? 0;
  const mesNegativo = projecaoMensal.find(m => m.saldoAcumulado < 0);

  // Chart data - all 3 scenarios for line chart
  const chartLineData = projecaoRealista.map((m, i) => ({
    name: m.label,
    otimista: projecaoOtimista[i].saldoAcumulado,
    realista: m.saldoAcumulado,
    pessimista: projecaoPessimista[i].saldoAcumulado,
  }));

  const chartBarData = projecaoMensal.map(m => ({
    name: m.label,
    receitas: m.receitas,
    despesas: m.despesasProjetadas,
  }));

  const fonteLabel = (f: DadosMes["fonteProjecao"]) => {
    switch (f) {
      case "lancadas": return "Lançamentos";
      case "orcamento": return "Orçamento";
      case "media": return "Média Histórica";
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <PageLoadingSkeleton type="dashboard" title="Projeção Inteligente" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projeção Inteligente</h1>
          <p className="text-muted-foreground text-sm">
            Simulação baseada em orçamentos, lançamentos e média histórica
          </p>
        </div>

        {/* Alert for negative balance */}
        {mesNegativo && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Risco de saldo negativo</AlertTitle>
            <AlertDescription>
              Atenção: Risco de saldo negativo projetado para{" "}
              <strong>{format(mesNegativo.mes, "MMMM/yyyy", { locale: ptBR })}</strong>{" "}
              ({formatCurrency(mesNegativo.saldoAcumulado)}).
            </AlertDescription>
          </Alert>
        )}

        {/* Top KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">Saldo Atual</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-48">Saldo real acumulado de contas correntes e poupança (transações executadas).</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                <div className="p-2 rounded-lg bg-warning/10">
                  <BarChart3 className="h-5 w-5 text-warning" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">Média Histórica</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-48">Média mensal de despesas executadas nos últimos 3 meses fechados. Usada como fallback inteligente na projeção.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-lg font-bold text-destructive">
                    {formatCurrency(mediaHistorica)}
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">Saldo Projetado (6m)</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-48">Saldo estimado ao final dos próximos 6 meses, considerando o maior valor entre lançamentos, orçamentos e média histórica.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className={`text-lg font-bold ${saldoFinal >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(saldoFinal)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Line Chart - Evolução do Patrimônio */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Evolução do Patrimônio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartLineData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    className="text-xs"
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip
                    formatter={(value: number) => [formatCurrency(value), "Saldo"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="saldo"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ r: 5, fill: "hsl(var(--primary))" }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Bar Chart - Receitas vs Despesas */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Receitas vs Despesas Projetadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartBarData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    className="text-xs"
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === "receitas" ? "Receitas" : "Despesas",
                    ]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Breakdown */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detalhamento Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Mês</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Receitas</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Desp. Lançadas</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Desp. Projetadas</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Fonte</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Saldo Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {projecaoMensal.map((m, i) => (
                    <tr key={i} className={`border-b last:border-0 ${m.saldoAcumulado < 0 ? "bg-destructive/5" : ""}`}>
                      <td className="py-3 font-medium capitalize">
                        {format(m.mes, "MMM/yy", { locale: ptBR })}
                        {i === 0 && <Badge variant="secondary" className="ml-2 text-[10px]">Atual</Badge>}
                      </td>
                      <td className="py-3 text-right text-success font-medium">
                        +{formatCurrency(m.receitas)}
                      </td>
                      <td className="py-3 text-right text-muted-foreground">
                        {formatCurrency(m.despesasLancadas)}
                      </td>
                      <td className="py-3 text-right text-destructive font-medium">
                        -{formatCurrency(m.despesasProjetadas)}
                      </td>
                      <td className="py-3 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            m.fonteProjecao === "orcamento"
                              ? "border-primary/50 text-primary"
                              : m.fonteProjecao === "media"
                              ? "border-warning/50 text-warning"
                              : "border-muted-foreground/50"
                          }`}
                        >
                          {fonteLabel(m.fonteProjecao)}
                        </Badge>
                      </td>
                      <td className={`py-3 text-right font-bold ${m.saldoAcumulado >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(m.saldoAcumulado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Radar de Faturas */}
        {radarFaturas.length > 0 && (
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                <CardTitle className="text-base">Radar de Faturas</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-52">Previsão do valor da fatura de cada cartão de crédito para os próximos 3 meses, baseada nos lançamentos já registrados.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {radarFaturas.map(({ cartao, meses }) => (
                  <Card key={cartao.id} className="border bg-muted/20">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: cartao.cor }}
                        />
                        <p className="font-medium text-sm truncate">{cartao.nome_conta}</p>
                      </div>
                      <div className="space-y-2">
                        {meses.map((m, i) => (
                          <div key={i} className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground capitalize">{m.label}</span>
                            <span className={`text-sm font-semibold ${m.valor > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                              {m.valor > 0 ? formatCurrency(m.valor) : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Projecao;
