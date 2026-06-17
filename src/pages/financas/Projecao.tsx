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
import { TrendingUp, TrendingDown, Wallet, PiggyBank, AlertCircle, CreditCard, Info, BarChart3, Target, Gauge, Repeat } from "lucide-react";
import { Progress } from "@/components/ui/progress";
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
  getDataCompetenciaTransacao, calcularFaturaAbertaCartao,
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
  parcelas_total?: number | null;
  mes_fatura_override?: string | null;
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
  limite?: number | null;
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

// ==========================================
// Radar de Recorrências (per-account)
// ==========================================

const RECORRENCIA_LABEL: Record<string, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const fatorMensal = (r: string | null | undefined): number => {
  switch ((r || "").toLowerCase()) {
    case "diaria": return 30;
    case "semanal": return 4.33;
    case "quinzenal": return 2;
    case "mensal": return 1;
    case "bimestral": return 1 / 2;
    case "trimestral": return 1 / 3;
    case "semestral": return 1 / 6;
    case "anual": return 1 / 12;
    default: return 1;
  }
};

interface RadarRecorrenciasProps {
  contaId: string;
  transacoes: Transacao[];
}

const RadarRecorrencias = ({ contaId, transacoes }: RadarRecorrenciasProps) => {
  const itens = useMemo(() => {
    const hoje = new Date();
    const inicioMes = startOfMonth(hoje);
    const fimMes = endOfMonth(hoje);
    const recorrentes = transacoes.filter(t => {
      if (t.conta_id !== contaId) return false;
      if (t.forma_pagamento === "transferencia") return false;
      if (t.tipo !== "receita" && t.tipo !== "despesa") return false;
      if (!t.recorrencia || t.recorrencia === "nenhuma") return false;
      // Apenas ocorrências do mês vigente
      const dataRef = parseISO(t.data_pagamento || t.data);
      if (isBefore(dataRef, inicioMes) || isAfter(dataRef, fimMes)) return false;
      // Inclui apenas fixas e mensais com número de parcela (parcelamento)
      if (t.recorrencia === "fixa") return true;
      if (t.recorrencia === "mensal" && t.parcela_atual && t.parcela_atual > 0) return true;
      return false;
    });
    // Dedupe by (descricao, valor, tipo, recorrencia) — recurring series share these
    const map = new Map<string, { descricao: string; valor: number; tipo: string; recorrencia: string; ocorrencias: number }>();
    for (const t of recorrentes) {
      const key = `${(t.descricao || "").trim().toLowerCase()}|${Number(t.valor)}|${t.tipo}|${t.recorrencia}`;
      const existing = map.get(key);
      if (existing) {
        existing.ocorrencias += 1;
      } else {
        map.set(key, {
          descricao: t.descricao || "(sem descrição)",
          valor: Number(t.valor),
          tipo: t.tipo,
          recorrencia: t.recorrencia || "mensal",
          ocorrencias: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [transacoes, contaId]);



  const receitas = itens.filter(i => i.tipo === "receita");
  const despesas = itens.filter(i => i.tipo === "despesa");

  const totalReceitasMensal = receitas.reduce((a, i) => a + i.valor * fatorMensal(i.recorrencia), 0);
  const totalDespesasMensal = despesas.reduce((a, i) => a + i.valor * fatorMensal(i.recorrencia), 0);
  const saldoLiquidoMensal = totalReceitasMensal - totalDespesasMensal;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4" />
          <CardTitle className="text-base">Radar de Recorrências</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Recorrências fixas e parcelamentos mensais desta conta, normalizados em base mensal.
        </p>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Nenhuma recorrência cadastrada para esta conta.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="p-4 rounded-lg bg-success/5 border border-success/20">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <p className="text-xs text-muted-foreground">Receitas recorrentes</p>
                </div>
                <p className="text-lg font-bold text-success">{formatCurrency(totalReceitasMensal)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {receitas.length} {receitas.length === 1 ? "lançamento" : "lançamentos"} / mês
                </p>
              </div>
              <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <p className="text-xs text-muted-foreground">Despesas recorrentes</p>
                </div>
                <p className="text-lg font-bold text-destructive">{formatCurrency(totalDespesasMensal)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {despesas.length} {despesas.length === 1 ? "lançamento" : "lançamentos"} / mês
                </p>
              </div>
              <div className={`p-4 rounded-lg border ${saldoLiquidoMensal >= 0 ? "bg-primary/5 border-primary/20" : "bg-warning/5 border-warning/20"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className={`h-4 w-4 ${saldoLiquidoMensal >= 0 ? "text-primary" : "text-warning"}`} />
                  <p className="text-xs text-muted-foreground">Líquido recorrente</p>
                </div>
                <p className={`text-lg font-bold ${saldoLiquidoMensal >= 0 ? "text-primary" : "text-warning"}`}>
                  {formatCurrency(saldoLiquidoMensal)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Receitas − despesas / mês
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {[
                { titulo: "Receitas", lista: receitas, cor: "text-success" },
                { titulo: "Despesas", lista: despesas, cor: "text-destructive" },
              ].map(grupo => (
                <div key={grupo.titulo}>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    {grupo.titulo}
                  </p>
                  {grupo.lista.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhuma recorrência.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {grupo.lista
                        .sort((a, b) => b.valor * fatorMensal(b.recorrencia) - a.valor * fatorMensal(a.recorrencia))
                        .map((i, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/40">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{i.descricao}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-[10px] py-0">
                                {RECORRENCIA_LABEL[i.recorrencia] || i.recorrencia}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {formatCurrency(i.valor)} por ocorrência
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-semibold ${grupo.cor}`}>
                              {formatCurrency(i.valor * fatorMensal(i.recorrencia))}
                            </p>
                            <p className="text-[10px] text-muted-foreground">/ mês</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ==========================================
// Projection View (used by total & per-account)
// ==========================================

interface ProjecaoViewProps {
  result: ProjectionResult;
  contas: Conta[];
  transacoes: Transacao[];
  cenario: Cenario;
  setCenario: (c: Cenario) => void;
  scopeLabel: string;
  showRadarFaturas?: boolean;
  scopeContaId?: string;
}


const ProjecaoView = ({ result, contas, transacoes, cenario, setCenario, scopeLabel, showRadarFaturas = true, scopeContaId }: ProjecaoViewProps) => {
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

      {scopeContaId && (
        <RadarRecorrencias contaId={scopeContaId} transacoes={transacoes} />
      )}

      {showRadarFaturas && radarFaturas.length > 0 && (
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
// Credit Card View (per-account when tipo === 'credito')
// ==========================================

interface CartaoViewProps {
  cartao: Conta;
  contas: Conta[];
  transacoes: Transacao[];
}

const CartaoView = ({ cartao, contas, transacoes }: CartaoViewProps) => {
  const hoje = new Date();

  // Only this card's expenses/credits affect invoices
  const txCartao = useMemo(
    () => transacoes.filter(t =>
      t.conta_id === cartao.id &&
      (t.tipo === "despesa" || t.tipo === "receita") &&
      t.forma_pagamento !== "transferencia"
    ),
    [transacoes, cartao.id],
  );

  const competenciaStr = (t: Transacao) => getDataCompetenciaTransacao(
    {
      data: t.data,
      data_pagamento: t.data_pagamento,
      conta_id: t.conta_id,
      parcela_atual: t.parcela_atual,
      parcelas_total: t.parcelas_total,
      mes_fatura_override: t.mes_fatura_override,
    },
    contas,
  );

  const signedDespesa = (t: Transacao) =>
    t.tipo === "receita" ? -Number(t.valor) : Number(t.valor);

  // Per-month invoice (by competência) for last 6 months (real) + next 6 (mix)
  type MesFatura = {
    mes: Date;
    label: string;
    valor: number;
    pago: number;
    pendente: number;
    isFuturo: boolean;
    isAtual: boolean;
  };

  const construirMes = (mes: Date): MesFatura => {
    const inicio = startOfMonth(mes);
    const fim = endOfMonth(mes);
    const inicioStr = format(inicio, "yyyy-MM-dd");
    const fimStr = format(fim, "yyyy-MM-dd");

    let pago = 0, pendente = 0;
    for (const t of txCartao) {
      const c = competenciaStr(t);
      if (c < inicioStr || c > fimStr) continue;
      const v = signedDespesa(t);
      if (isExecutado(t.is_pago_executado)) pago += v;
      else pendente += v;
    }
    const valor = pago + pendente;
    const isAtual = format(mes, "yyyy-MM") === format(hoje, "yyyy-MM");
    const isFuturo = isAfter(startOfMonth(mes), endOfMonth(hoje));
    return {
      mes,
      label: format(mes, "MMM/yy", { locale: ptBR }),
      valor: Math.max(0, valor),
      pago: Math.max(0, pago),
      pendente: Math.max(0, pendente),
      isFuturo,
      isAtual,
    };
  };

  const passadas: MesFatura[] = [];
  for (let i = 6; i >= 1; i--) passadas.push(construirMes(subMonths(hoje, i)));

  const futuras: MesFatura[] = [];
  for (let i = 0; i < 6; i++) futuras.push(construirMes(addMonths(hoje, i)));

  // Average from past closed months (excluding zero months)
  const passadasComValor = passadas.filter(m => m.valor > 0);
  const mediaMensal = passadasComValor.length
    ? passadasComValor.reduce((a, m) => a + m.valor, 0) / passadasComValor.length
    : 0;

  // Smart projection for future months: max(lancado, media)
  const futurasProjetadas = futuras.map((m, idx) => {
    if (m.isAtual) return m;
    const projetado = Math.max(m.valor, mediaMensal);
    return { ...m, valorProjetado: projetado };
  });

  // Open invoice (current liability)
  const faturaAberta = useMemo(
    () => calcularFaturaAbertaCartao(cartao, transacoes as any, contas as any),
    [cartao, transacoes, contas],
  );

  const limite = cartao.limite ?? 0;
  const temLimite = limite > 0;
  const utilizado = temLimite ? Math.min(100, (faturaAberta / limite) * 100) : 0;
  const disponivel = temLimite ? Math.max(0, limite - faturaAberta) : 0;

  // Projected total commitment for upcoming 6 invoices (future obligations)
  const totalComprometidoFuturo = futurasProjetadas.reduce(
    (a, m: any) => a + (m.valorProjetado ?? m.valor),
    0,
  );

  const chartData = [
    ...passadas.map(m => ({
      name: m.label,
      real: m.valor,
      projetada: null as number | null,
      tipo: "real" as const,
    })),
    ...futurasProjetadas.map((m: any) => ({
      name: m.label,
      real: m.isAtual ? m.valor : null,
      projetada: m.isAtual ? m.valor : m.valorProjetado,
      tipo: m.isAtual ? "atual" : "futuro",
    })),
  ];

  const proximaFatura = futurasProjetadas[0];
  const seguinte = futurasProjetadas[1];

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <CreditCard className="h-5 w-5 text-destructive" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Fatura em Aberto</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(faturaAberta)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Fechada não paga + aberta atual
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Gauge className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Limite Disponível</p>
                {temLimite ? (
                  <>
                    <p className={`text-lg font-bold ${utilizado >= 90 ? "text-destructive" : utilizado >= 70 ? "text-warning" : "text-success"}`}>
                      {formatCurrency(disponivel)}
                    </p>
                    <div className="mt-1.5">
                      <Progress value={utilizado} className="h-1.5" />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {utilizado.toFixed(0)}% de {formatCurrency(limite)}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-muted-foreground">—</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Defina o limite na conta</p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <BarChart3 className="h-5 w-5 text-warning" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Média Mensal</p>
                <p className="text-lg font-bold">{formatCurrency(mediaMensal)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Base: {passadasComValor.length} {passadasComValor.length === 1 ? "fatura" : "faturas"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary">
                <TrendingUp className="h-5 w-5 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Comprometido 6 meses</p>
                <p className="text-lg font-bold">{formatCurrency(totalComprometidoFuturo)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Soma das próximas faturas projetadas
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {temLimite && utilizado >= 90 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Limite quase esgotado</AlertTitle>
          <AlertDescription>
            A fatura em aberto consome {utilizado.toFixed(0)}% do limite de {formatCurrency(limite)}.
          </AlertDescription>
        </Alert>
      )}
      {proximaFatura && mediaMensal > 0 && (proximaFatura as any).valorProjetado > mediaMensal * 1.3 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Próxima fatura acima da média</AlertTitle>
          <AlertDescription>
            Projeção da próxima fatura ({formatCurrency((proximaFatura as any).valorProjetado)}) é{" "}
            {(((((proximaFatura as any).valorProjetado / mediaMensal) - 1) * 100)).toFixed(0)}% acima da média histórica.
          </AlertDescription>
        </Alert>
      )}

      {/* Chart: invoices history + projection */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Histórico e Projeção de Faturas
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <RechartsTooltip
                formatter={(value: number, name: string) => {
                  if (value == null) return ["—", name];
                  const labels: Record<string, string> = { real: "Fatura Real", projetada: "Fatura Projetada" };
                  return [formatCurrency(value), labels[name] || name];
                }}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px", fontSize: "12px",
                }}
              />
              <Legend formatter={(value: string) => {
                const labels: Record<string, string> = { real: "Fatura Real", projetada: "Projeção" };
                return labels[value] || value;
              }} />
              {mediaMensal > 0 && (
                <ReferenceLine
                  y={mediaMensal}
                  stroke="hsl(var(--warning))"
                  strokeDasharray="4 4"
                  label={{ value: `Média ${formatCurrency(mediaMensal)}`, position: "insideTopRight", fill: "hsl(var(--warning))", fontSize: 10 }}
                />
              )}
              {temLimite && (
                <ReferenceLine
                  y={limite}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="2 2"
                  label={{ value: `Limite ${formatCurrency(limite)}`, position: "insideBottomRight", fill: "hsl(var(--destructive))", fontSize: 10 }}
                />
              )}
              <Bar dataKey="real" name="real" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="projetada" name="projetada" fill="hsl(var(--muted-foreground))" fillOpacity={0.5} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Future invoices table */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Próximas Faturas (6 meses)</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {/* Mobile */}
          <div className="md:hidden divide-y divide-border">
            {futurasProjetadas.map((m: any, i) => {
              const valor = m.valorProjetado ?? m.valor;
              const diffMedia = mediaMensal > 0 ? ((valor / mediaMensal) - 1) * 100 : 0;
              const utilFat = temLimite ? (valor / limite) * 100 : 0;
              return (
                <div key={i} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold capitalize text-sm">{m.label}</span>
                      {m.isAtual && <Badge variant="secondary" className="text-[10px]">Atual</Badge>}
                    </div>
                    <span className="text-sm font-bold text-destructive">{formatCurrency(valor)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lançado</span>
                      <span className="font-medium">{formatCurrency(m.valor)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">vs Média</span>
                      <span className={`font-medium ${diffMedia > 10 ? "text-destructive" : diffMedia < -10 ? "text-success" : "text-muted-foreground"}`}>
                        {mediaMensal > 0 ? `${diffMedia >= 0 ? "+" : ""}${diffMedia.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                    {temLimite && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-muted-foreground">% Limite</span>
                        <span className={`font-medium ${utilFat >= 90 ? "text-destructive" : utilFat >= 70 ? "text-warning" : ""}`}>
                          {utilFat.toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 px-2 font-medium text-muted-foreground">Mês</th>
                  <th className="pb-3 px-2 font-medium text-muted-foreground text-right">Lançado</th>
                  <th className="pb-3 px-2 font-medium text-muted-foreground text-right">
                    <Tooltip>
                      <TooltipTrigger asChild><span className="inline-flex items-center gap-1 cursor-help">Projetado <Info className="h-3 w-3" /></span></TooltipTrigger>
                      <TooltipContent><p className="text-xs max-w-52">Maior valor entre o lançado e a média histórica das faturas.</p></TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="pb-3 px-2 font-medium text-muted-foreground text-right">vs Média</th>
                  {temLimite && <th className="pb-3 px-2 font-medium text-muted-foreground text-right">% Limite</th>}
                  <th className="pb-3 px-2 font-medium text-muted-foreground text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {futurasProjetadas.map((m: any, i) => {
                  const valor = m.valorProjetado ?? m.valor;
                  const diffMedia = mediaMensal > 0 ? ((valor / mediaMensal) - 1) * 100 : 0;
                  const utilFat = temLimite ? (valor / limite) * 100 : 0;
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-4 px-2 font-medium capitalize">
                        {m.label}
                        {m.isAtual && <Badge variant="secondary" className="ml-2 text-[10px]">Atual</Badge>}
                      </td>
                      <td className="py-4 px-2 text-right text-muted-foreground">{formatCurrency(m.valor)}</td>
                      <td className="py-4 px-2 text-right font-semibold text-destructive">{formatCurrency(valor)}</td>
                      <td className={`py-4 px-2 text-right font-medium ${diffMedia > 10 ? "text-destructive" : diffMedia < -10 ? "text-success" : "text-muted-foreground"}`}>
                        {mediaMensal > 0 ? `${diffMedia >= 0 ? "+" : ""}${diffMedia.toFixed(0)}%` : "—"}
                      </td>
                      {temLimite && (
                        <td className={`py-4 px-2 text-right font-medium ${utilFat >= 90 ? "text-destructive" : utilFat >= 70 ? "text-warning" : ""}`}>
                          {utilFat.toFixed(0)}%
                        </td>
                      )}
                      <td className="py-4 px-2 text-center">
                        <Badge variant="outline" className="text-[10px]">
                          {m.isAtual ? "Aberta" : "Futura"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <RadarRecorrencias contaId={cartao.id} transacoes={transacoes} />
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
                {resultConta && (() => {
                  const contaSel = contasUsuario.find(c => c.id === effectiveContaId);
                  if (contaSel?.tipo === "credito") {
                    return (
                      <CartaoView
                        cartao={contaSel}
                        contas={contas}
                        transacoes={transacoes}
                      />
                    );
                  }
                  return (
                    <ProjecaoView
                      result={resultConta}
                      contas={contas}
                      transacoes={transacoes}
                      cenario={cenario}
                      setCenario={setCenario}
                      scopeLabel={contaSel?.nome_conta || "Conta"}
                      showRadarFaturas={false}
                      scopeContaId={effectiveContaId}
                    />
                  );
                })()}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Projecao;
