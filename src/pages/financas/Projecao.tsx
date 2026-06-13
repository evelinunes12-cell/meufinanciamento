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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, AlertCircle, CreditCard, Info, BarChart3, Target } from "lucide-react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  parseISO, isBefore, isAfter,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  isExecutado, calcularSaldoRealConta, getDataEfetiva,
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
  incluir_no_saldo?: boolean | null;
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
  saldoReal: number;
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
    contas,
  );
}

// ==========================================
// Projection logic (reusable per filter)
// ==========================================

interface ProjectionResult {
  saldoAtual: number;
  mediaHistorica: number;
  mesesUsadosMedia: number;
  totalOrcamentos: number;
  projecaoRealista: DadosMes[];
  projecaoOtimista: DadosMes[];
  projecaoPessimista: DadosMes[];
}

function calcularSaldoRealAteFim(
  contas: Conta[],
  transacoesTodas: Transacao[],
  fim: Date,
  contaFilterId: string | null,
): number {
  // Per-account view: include the selected account regardless of tipo/incluir_no_saldo.
  // Total view: respects the "incluir no saldo" flag and excludes credit cards.
  const contasAtivo = contaFilterId
    ? contas.filter(c => c.id === contaFilterId)
    : contas.filter(c => c.tipo !== "credito" && c.incluir_no_saldo !== false);
  const contasAtivoIds = new Set(contasAtivo.map(c => c.id));
  let total = contasAtivo.reduce((a, c) => a + Number(c.saldo_inicial), 0);

  for (const t of transacoesTodas) {
    if (!isExecutado(t.is_pago_executado)) continue;
    const de = parseISO(getDataEfetivaStr(t, contas));
    if (isAfter(de, fim)) continue;

    if (t.forma_pagamento === "transferencia") {
      // only process the source record (which carries conta_destino_id)
      if (!t.conta_destino_id) continue;
      const fromIn = contasAtivoIds.has(t.conta_id);
      const toIn = contasAtivoIds.has(t.conta_destino_id);
      if (fromIn) total -= Number(t.valor);
      if (toIn) total += Number(t.valor);
      continue;
    }
    if (!contasAtivoIds.has(t.conta_id)) continue;
    if (t.tipo === "receita") total += Number(t.valor);
    else if (t.tipo === "despesa") total -= Number(t.valor);
  }
  return total;
}

function buildProjection(
  contas: Conta[],
  transacoes: Transacao[],
  orcamentos: Orcamento[],
  contaFilterId: string | null,
): ProjectionResult {
  // Filter the working set
  const transacoesFiltered = transacoes.filter(t => {
    if (t.forma_pagamento === "transferencia") {
      // Transfers don't change global totals; per-account we still see in/out
      if (!contaFilterId) return false;
      return t.conta_id === contaFilterId || t.conta_destino_id === contaFilterId;
    }
    if (contaFilterId) return t.conta_id === contaFilterId;
    return true;
  });

  // Saldo atual real
  const contasAtivo = contaFilterId
    ? contas.filter(c => c.id === contaFilterId)
    : contas.filter(c => c.tipo !== "credito" && c.incluir_no_saldo !== false);
  const mapped = transacoes.map(t => ({
    valor: t.valor, tipo: t.tipo, conta_id: t.conta_id,
    conta_destino_id: t.conta_destino_id,
    forma_pagamento: t.forma_pagamento,
    is_pago_executado: t.is_pago_executado, data: t.data,
  }));
  const saldoAtual = contasAtivo.reduce((acc, c) => acc + calcularSaldoRealConta(c, mapped), 0);

  // Média histórica (12 meses, apenas meses com despesa)
  const hoje = new Date();
  const mesesComDados: number[] = [];
  for (let i = 1; i <= 12; i++) {
    const mes = subMonths(hoje, i);
    const inicio = startOfMonth(mes);
    const fim = endOfMonth(mes);
    const despesasMes = transacoesFiltered
      .filter(t => {
        if (t.tipo !== "despesa") return false;
        if (t.forma_pagamento === "transferencia") return false;
        if (!isExecutado(t.is_pago_executado)) return false;
        const de = parseISO(getDataEfetivaStr(t, contas));
        return !isBefore(de, inicio) && !isAfter(de, fim);
      })
      .reduce((a, t) => a + Number(t.valor), 0);
    if (despesasMes > 0) mesesComDados.push(despesasMes);
  }
  const mediaHistorica = mesesComDados.length
    ? mesesComDados.reduce((a, b) => a + b, 0) / mesesComDados.length
    : 0;

  // Orçamentos: somente para visão total
  let totalOrcamentos = 0;
  if (!contaFilterId && orcamentos.length > 0) {
    const mesAtualStr = format(startOfMonth(hoje), "yyyy-MM-dd");
    let orcamentosMes = orcamentos.filter(o => o.mes_referencia === mesAtualStr);
    if (orcamentosMes.length === 0) {
      const sorted = [...orcamentos].sort((a, b) => b.mes_referencia.localeCompare(a.mes_referencia));
      const latestMonth = sorted[0]?.mes_referencia;
      orcamentosMes = orcamentos.filter(o => o.mes_referencia === latestMonth);
    }
    totalOrcamentos = orcamentosMes.reduce((a, o) => a + Number(o.valor_limite), 0);
  }

  // Base por mês
  type Base = {
    mes: Date; label: string;
    receitas: number; receitasPendentes: number;
    despesasLancadas: number; despesasLancadasPendentes: number;
    despesasBase: number; fonteProjecao: DadosMes["fonteProjecao"];
  };
  const base: Base[] = [];
  for (let i = 0; i < 6; i++) {
    const mes = addMonths(hoje, i);
    const inicio = startOfMonth(mes);
    const fim = endOfMonth(mes);
    const isMesAtual = i === 0;

    const transacoesMes = transacoesFiltered.filter(t => {
      const de = parseISO(getDataEfetivaStr(t, contas));
      return !isBefore(de, inicio) && !isAfter(de, fim);
    });

    // Receitas/despesas — em visão por conta, incluir transferências como entrada/saída
    let receitas = 0, despesas = 0, receitasPendentes = 0, despesasPendentes = 0;
    for (const t of transacoesMes) {
      const valor = Number(t.valor);
      const pago = isExecutado(t.is_pago_executado);
      if (t.forma_pagamento === "transferencia") {
        if (!contaFilterId) continue;
        if (t.conta_destino_id === contaFilterId) {
          receitas += valor;
          if (!pago) receitasPendentes += valor;
        } else if (t.conta_id === contaFilterId) {
          despesas += valor;
          if (!pago) despesasPendentes += valor;
        }
        continue;
      }
      if (t.tipo === "receita") {
        receitas += valor;
        if (!pago) receitasPendentes += valor;
      } else if (t.tipo === "despesa") {
        despesas += valor;
        if (!pago) despesasPendentes += valor;
      }
    }

    const candidatos = [
      { valor: despesas, fonte: "lancadas" as const },
      { valor: totalOrcamentos, fonte: "orcamento" as const },
      { valor: mediaHistorica, fonte: "media" as const },
    ];
    const melhor = candidatos.reduce((a, b) => (b.valor > a.valor ? b : a));

    const despesasBase = isMesAtual ? despesas : melhor.valor;
    const fonteProjecao = isMesAtual ? "lancadas" as const : melhor.fonte;

    base.push({
      mes, label: format(mes, "MMM/yy", { locale: ptBR }),
      receitas, receitasPendentes,
      despesasLancadas: despesas,
      despesasLancadasPendentes: despesasPendentes,
      despesasBase, fonteProjecao,
    });
  }

  const build = (fator: number): DadosMes[] => {
    let saldoAcumulado = saldoAtual;
    return base.map((m, i) => {
      const isMesAtual = i === 0;
      const despesasProjetadas = isMesAtual ? m.despesasBase : m.despesasBase * (1 + fator);
      const receitasParaSaldo = isMesAtual ? m.receitasPendentes : m.receitas;
      const despesasParaSaldo = isMesAtual ? m.despesasLancadasPendentes : despesasProjetadas;
      saldoAcumulado = saldoAcumulado + receitasParaSaldo - despesasParaSaldo;
      const saldoReal = calcularSaldoRealAteFim(contas, transacoes, endOfMonth(m.mes), contaFilterId);
      return {
        mes: m.mes, label: m.label, receitas: m.receitas,
        despesasLancadas: m.despesasLancadas, despesasProjetadas,
        fonteProjecao: m.fonteProjecao, saldoAcumulado, saldoReal,
      };
    });
  };

  return {
    saldoAtual,
    mediaHistorica,
    mesesUsadosMedia: mesesComDados.length,
    totalOrcamentos,
    projecaoRealista: build(CENARIO_CONFIG.realista.fator),
    projecaoOtimista: build(CENARIO_CONFIG.otimista.fator),
    projecaoPessimista: build(CENARIO_CONFIG.pessimista.fator),
  };
}

// ==========================================
// View
// ==========================================

interface ProjecaoViewProps {
  result: ProjectionResult;
  contas: Conta[];
  transacoes: Transacao[];
  cenario: Cenario;
  setCenario: (c: Cenario) => void;
  scopeLabel: string;
}

const ProjecaoView = ({ result, contas, transacoes, cenario, setCenario, scopeLabel }: ProjecaoViewProps) => {
  const { saldoAtual, mediaHistorica, mesesUsadosMedia, projecaoOtimista, projecaoRealista, projecaoPessimista } = result;
  const projecaoMensal = cenario === "otimista" ? projecaoOtimista : cenario === "pessimista" ? projecaoPessimista : projecaoRealista;
  const saldoFinal = projecaoMensal[projecaoMensal.length - 1]?.saldoAcumulado ?? 0;
  const mesNegativo = projecaoMensal.find(m => m.saldoAcumulado < 0);

  const chartLineData = projecaoRealista.map((m, i) => ({
    name: m.label,
    otimista: projecaoOtimista[i].saldoAcumulado,
    realista: m.saldoAcumulado,
    pessimista: projecaoPessimista[i].saldoAcumulado,
    real: m.saldoReal,
  }));

  const chartBarData = projecaoMensal.map(m => ({
    name: m.label,
    receitas: m.receitas,
    despesas: m.despesasProjetadas,
  }));

  const transacoesSemTransf = useMemo(
    () => transacoes.filter(t => t.forma_pagamento !== "transferencia"),
    [transacoes],
  );

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
        meses.push({ label: format(mes, "MMM/yy", { locale: ptBR }), valor: valorFatura });
      }
      return { cartao, meses };
    });
  }, [contas, transacoesSemTransf]);

  const fonteLabel = (f: DadosMes["fonteProjecao"]) => {
    switch (f) {
      case "lancadas": return "Lançamentos";
      case "orcamento": return "Orçamento";
      case "media": return "Média Histórica";
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <ToggleGroup
            type="single"
            value={cenario}
            onValueChange={(v) => v && setCenario(v as Cenario)}
            className="bg-muted rounded-lg p-1"
          >
            {(Object.keys(CENARIO_CONFIG) as Cenario[]).map(c => (
              <ToggleGroupItem
                key={c}
                value={c}
                className="text-xs px-2 sm:px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                <Tooltip>
                  <TooltipTrigger asChild><span>{CENARIO_CONFIG[c].label}</span></TooltipTrigger>
                  <TooltipContent><p className="text-xs">{CENARIO_CONFIG[c].descricao}</p></TooltipContent>
                </Tooltip>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {mesNegativo && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Risco de saldo negativo</AlertTitle>
          <AlertDescription>
            {scopeLabel}: risco de saldo negativo projetado para{" "}
            <strong>{format(mesNegativo.mes, "MMMM/yyyy", { locale: ptBR })}</strong>{" "}
            ({formatCurrency(mesNegativo.saldoAcumulado)}).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Wallet className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Saldo Atual Real</p>
                <p className={`text-lg font-bold ${saldoAtual >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(saldoAtual)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10"><BarChart3 className="h-5 w-5 text-warning" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Média Histórica</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(mediaHistorica)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Base: {mesesUsadosMedia} {mesesUsadosMedia === 1 ? "mês" : "meses"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10"><PiggyBank className="h-5 w-5 text-success" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Saldo Projetado - {CENARIO_CONFIG[cenario].label}</p>
                <p className={`text-lg font-bold ${saldoFinal >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(saldoFinal)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Projetado vs Real
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartLineData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      otimista: "Otimista", realista: "Realista", pessimista: "Pessimista", real: "Saldo Real",
                    };
                    return [formatCurrency(value), labels[name] || name];
                  }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px", fontSize: "12px",
                  }}
                />
                <Legend formatter={(value: string) => {
                  const labels: Record<string, string> = {
                    otimista: "Otimista (-15%)", realista: "Realista", pessimista: "Pessimista (+20%)",
                    real: "Saldo Real (executado)",
                  };
                  return labels[value] || value;
                }} />
                <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="otimista" stroke="hsl(var(--success))" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="realista" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                <Line type="monotone" dataKey="pessimista" stroke="hsl(var(--destructive))" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="real" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Receitas vs Despesas Projetadas
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={chartBarData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value), name === "receitas" ? "Receitas" : "Despesas",
                  ]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px", fontSize: "12px",
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

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Detalhamento Mensal</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="md:hidden divide-y divide-border">
            {projecaoMensal.map((m, i) => (
              <div key={i} className={`p-3 space-y-2 ${m.saldoAcumulado < 0 ? "bg-destructive/5" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold capitalize text-sm">{format(m.mes, "MMM/yy", { locale: ptBR })}</span>
                    {i === 0 && <Badge variant="secondary" className="text-[10px]">Atual</Badge>}
                  </div>
                  <span className={`text-sm font-bold ${m.saldoAcumulado >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(m.saldoAcumulado)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receitas</span>
                    <span className="text-success font-medium">+{formatCurrency(m.receitas)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Despesas</span>
                    <span className="text-destructive font-medium">-{formatCurrency(m.despesasProjetadas)}</span>
                  </div>
                  <div className="flex justify-between col-span-2">
                    <span className="text-muted-foreground">Saldo Real</span>
                    <span className={`font-medium ${m.saldoReal >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(m.saldoReal)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Fonte</span>
                  <Badge variant="outline" className={`text-[10px] ${
                    m.fonteProjecao === "orcamento" ? "border-primary/50 text-primary"
                      : m.fonteProjecao === "media" ? "border-warning/50 text-warning"
                      : "border-muted-foreground/50"
                  }`}>{fonteLabel(m.fonteProjecao)}</Badge>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 px-2 font-medium text-muted-foreground">Mês</th>
                  <th className="pb-3 px-2 font-medium text-muted-foreground text-right">Receitas</th>
                  <th className="pb-3 px-2 font-medium text-muted-foreground text-right">Desp. Lançadas</th>
                  <th className="pb-3 px-2 font-medium text-muted-foreground text-right">Desp. Projetadas</th>
                  <th className="pb-3 px-2 font-medium text-muted-foreground text-center">Fonte</th>
                  <th className="pb-3 px-2 font-medium text-muted-foreground text-right">
                    <Tooltip>
                      <TooltipTrigger asChild><span className="inline-flex items-center gap-1 cursor-help">Saldo Real <Info className="h-3 w-3" /></span></TooltipTrigger>
                      <TooltipContent><p className="text-xs max-w-52">Saldo real ao fim do mês, considerando apenas transações executadas (comparativo com a projeção).</p></TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="pb-3 px-2 font-medium text-muted-foreground text-right">Saldo Projetado</th>
                </tr>
              </thead>
              <tbody>
                {projecaoMensal.map((m, i) => (
                  <tr key={i} className={`border-b last:border-0 ${m.saldoAcumulado < 0 ? "bg-destructive/5" : ""}`}>
                    <td className="py-4 px-2 font-medium capitalize">
                      {format(m.mes, "MMM/yy", { locale: ptBR })}
                      {i === 0 && <Badge variant="secondary" className="ml-2 text-[10px]">Atual</Badge>}
                    </td>
                    <td className="py-4 px-2 text-right text-success font-medium">+{formatCurrency(m.receitas)}</td>
                    <td className="py-4 px-2 text-right text-muted-foreground">{formatCurrency(m.despesasLancadas)}</td>
                    <td className="py-4 px-2 text-right text-destructive font-medium">-{formatCurrency(m.despesasProjetadas)}</td>
                    <td className="py-4 px-2 text-center">
                      <Badge variant="outline" className={`text-[10px] ${
                        m.fonteProjecao === "orcamento" ? "border-primary/50 text-primary"
                          : m.fonteProjecao === "media" ? "border-warning/50 text-warning"
                          : "border-muted-foreground/50"
                      }`}>{fonteLabel(m.fonteProjecao)}</Badge>
                    </td>
                    <td className={`py-4 px-2 text-right font-medium ${m.saldoReal >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(m.saldoReal)}
                    </td>
                    <td className={`py-4 px-2 text-right font-bold ${m.saldoAcumulado >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(m.saldoAcumulado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {radarFaturas.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <CardTitle className="text-base">Radar de Faturas</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {radarFaturas.map(({ cartao, meses }) => (
                <Card key={cartao.id} className="border bg-muted/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cartao.cor }} />
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
  );
};

// ==========================================
// Page
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
  const [tab, setTab] = useState<"total" | "conta">("total");

  const transacoes = data?.transacoes || [];
  const contas = data?.contas || [];
  const orcamentos = data?.orcamentos || [];

  // Per-account tab lists every account (corrente, poupança, crédito, etc.),
  // regardless of "incluir no saldo". This flag only impacts the total view.
  const contasUsuario = useMemo(
    () => [...contas].sort((a, b) => a.nome_conta.localeCompare(b.nome_conta)),
    [contas],
  );

  const [selectedContaId, setSelectedContaId] = useState<string>("");
  const effectiveContaId = selectedContaId || contasUsuario[0]?.id || "";

  const resultTotal = useMemo(
    () => buildProjection(contas, transacoes, orcamentos, null),
    [contas, transacoes, orcamentos],
  );
  const resultConta = useMemo(
    () => effectiveContaId
      ? buildProjection(contas, transacoes, orcamentos, effectiveContaId)
      : null,
    [contas, transacoes, orcamentos, effectiveContaId],
  );

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
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Projeção Inteligente</h1>
          <p className="text-muted-foreground text-sm">
            Simulação baseada em orçamentos, lançamentos e média histórica
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "total" | "conta")}>
          <TabsList className="grid grid-cols-2 w-full sm:w-auto">
            <TabsTrigger value="total">Projeção Total</TabsTrigger>
            <TabsTrigger value="conta">Por Conta</TabsTrigger>
          </TabsList>

          <TabsContent value="total" className="mt-6">
            <ProjecaoView
              result={resultTotal}
              contas={contas}
              transacoes={transacoes}
              cenario={cenario}
              setCenario={setCenario}
              scopeLabel="Total (todas as contas)"
            />
          </TabsContent>

          <TabsContent value="conta" className="mt-6 space-y-4">
            {contasUsuario.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Nenhuma conta cadastrada</AlertTitle>
                <AlertDescription>Cadastre uma conta para ver a projeção individual.</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Conta:</span>
                  <Select value={effectiveContaId} onValueChange={setSelectedContaId}>
                    <SelectTrigger className="w-full sm:w-72">
                      <SelectValue placeholder="Selecione uma conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {contasUsuario.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
                            {c.nome_conta}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {resultConta && (
                  <ProjecaoView
                    result={resultConta}
                    contas={contas}
                    transacoes={transacoes}
                    cenario={cenario}
                    setCenario={setCenario}
                    scopeLabel={contasUsuario.find(c => c.id === effectiveContaId)?.nome_conta || "Conta"}
                  />
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Projecao;
