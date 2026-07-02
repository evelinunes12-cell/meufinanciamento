import { useState, useMemo, Fragment } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Download, FileText, TrendingUp, TrendingDown, ChevronRight, ChevronDown, ArrowDown, ArrowUp, Flame } from "lucide-react";
import { format, parseISO, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { AdvancedFilters, FilterState, getDateRangeFromFilters, getInitialFilterState, getCategoryIdsForFilter } from "@/components/AdvancedFilters";
import { isExecutado, filterTransacoesPorPeriodoEfetivo } from "@/lib/transactions";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

interface Transacao {
  id: string;
  conta_id: string;
  conta_destino_id?: string | null;
  categoria_id: string | null;
  valor: number;
  tipo: string;
  data: string;
  data_pagamento: string | null;
  forma_pagamento: string;
  descricao: string | null;
  is_pago_executado: boolean | null;
  recorrencia?: string | null;
}

interface TransacaoConta extends Transacao {
  _tipoEfetivo: "receita" | "despesa";
  _origemLabel: string | null;
}

interface Conta {
  id: string;
  nome_conta: string;
  saldo_inicial: number;
  tipo: string;
  dia_fechamento: number | null;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  cor: string;
  categoria_pai_id?: string | null;
}

// Fix timezone issue by using parseISO
const formatDate = (dateString: string) => {
  const date = parseISO(dateString);
  return format(date, "dd/MM/yyyy", { locale: ptBR });
};

async function fetchRelatoriosData(userId: string | undefined, startDate: string, endDate: string) {
  if (!userId) return null;

  // Fetch all transactions - we filter by effective date client-side
  const [transacoesRes, contasRes, categoriasRes] = await Promise.all([
    supabase
      .from("transacoes")
      .select("*")
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

const Relatorios = () => {
  const { user } = useAuth();
  const [filters, setFilters] = useState<FilterState>(getInitialFilterState());
  const [tipoRelatorio, setTipoRelatorio] = useState("geral");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const toggleCat = (id: string) => setExpandedCats(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const [expandedContas, setExpandedContas] = useState<Set<string>>(new Set());
  const toggleConta = (id: string) => setExpandedContas(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const [expandedPagamentos, setExpandedPagamentos] = useState<Set<string>>(new Set());
  const togglePagamento = (id: string) => setExpandedPagamentos(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const [drilldownCatId, setDrilldownCatId] = useState<string | null>(null);



  const { startDate, endDate } = getDateRangeFromFilters(filters);

  const { data, isLoading } = useQuery({
    queryKey: ["relatorios", user?.id, startDate, endDate],
    queryFn: () => fetchRelatoriosData(user?.id, startDate, endDate),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const allTransacoes = data?.transacoes || [];
  const contas = data?.contas || [];
  const categorias = data?.categorias || [];

  // First filter by effective date (uses data_pagamento for credit cards)
  const transacoesNoPeriodo = useMemo(() => {
    return filterTransacoesPorPeriodoEfetivo(allTransacoes, contas, startDate, endDate);
  }, [allTransacoes, contas, startDate, endDate]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const getContaNome = (id: string) => contas.find(c => c.id === id)?.nome_conta || "-";
  const getCategoriaNome = (id: string | null) => id ? categorias.find(c => c.id === id)?.nome || "-" : "-";

  // Apply advanced filters client-side (after date filtering)
  const filteredTransacoes = useMemo(() => {
    let result = transacoesNoPeriodo;
    
    if (filters.tipo) {
      result = result.filter(t => t.tipo === filters.tipo);
    }
    
    // Category filter - includes subcategories when parent is selected
    if (filters.categoriaId || filters.subcategoriaId) {
      const categoryIds = getCategoryIdsForFilter(
        filters.categoriaId, 
        filters.subcategoriaId, 
        categorias
      );
      result = result.filter(t => t.categoria_id && categoryIds.includes(t.categoria_id));
    }
    
    if (filters.contaId) {
      result = result.filter(t => t.conta_id === filters.contaId);
    }
    if (filters.formaPagamento) {
      result = result.filter(t => t.forma_pagamento === filters.formaPagamento);
    }
    if (filters.statusPagamento) {
      result = result.filter(t => {
        const isPago = isExecutado(t.is_pago_executado);
        return filters.statusPagamento === "pago" ? isPago : !isPago;
      });
    }
    
    return result;
  }, [transacoesNoPeriodo, categorias, filters.tipo, filters.categoriaId, filters.subcategoriaId, filters.contaId, filters.formaPagamento, filters.statusPagamento]);

  // Filter valid transactions: exclude transfers for aggregations.
  // Also exclude pending (not yet executed) transactions so numbers reflect what
  // actually happened — unless the user explicitly filtered by status.
  const transacoesValidasComPendentes = filteredTransacoes.filter(t => t.forma_pagamento !== "transferencia");
  const transacoesValidas = filters.statusPagamento
    ? transacoesValidasComPendentes
    : transacoesValidasComPendentes.filter(t => isExecutado(t.is_pago_executado));

  const totalReceitas = transacoesValidas.filter(t => t.tipo === "receita").reduce((acc, t) => acc + Number(t.valor), 0);
  const totalDespesas = transacoesValidas.filter(t => t.tipo === "despesa").reduce((acc, t) => acc + Number(t.valor), 0);
  const saldo = totalReceitas - totalDespesas;

  // ---- Comparativo com mês anterior (KPIs) ----
  const prevPeriod = useMemo(() => {
    if (!startDate || !endDate) return null;
    const ps = format(subMonths(parseISO(startDate), 1), "yyyy-MM-dd");
    const pe = format(subMonths(parseISO(endDate), 1), "yyyy-MM-dd");
    return { ps, pe };
  }, [startDate, endDate]);

  const prevTransacoes = useMemo(() => {
    if (!prevPeriod) return [];
    const base = filterTransacoesPorPeriodoEfetivo(allTransacoes, contas, prevPeriod.ps, prevPeriod.pe);
    let result = base;
    if (filters.tipo) result = result.filter(t => t.tipo === filters.tipo);
    if (filters.categoriaId || filters.subcategoriaId) {
      const ids = getCategoryIdsForFilter(filters.categoriaId, filters.subcategoriaId, categorias);
      result = result.filter(t => t.categoria_id && ids.includes(t.categoria_id));
    }
    if (filters.contaId) result = result.filter(t => t.conta_id === filters.contaId);
    if (filters.formaPagamento) result = result.filter(t => t.forma_pagamento === filters.formaPagamento);
    if (filters.statusPagamento) {
      result = result.filter(t => {
        const pago = isExecutado(t.is_pago_executado);
        return filters.statusPagamento === "pago" ? pago : !pago;
      });
    }
    const noTransfer = result.filter(t => t.forma_pagamento !== "transferencia");
    return filters.statusPagamento
      ? noTransfer
      : noTransfer.filter(t => isExecutado(t.is_pago_executado));
  }, [allTransacoes, contas, categorias, prevPeriod, filters]);

  const prevReceitas = prevTransacoes.filter(t => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
  const prevDespesas = prevTransacoes.filter(t => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
  const prevSaldo = prevReceitas - prevDespesas;

  const calcVar = (current: number, prev: number) => {
    if (prev === 0) return current === 0 ? 0 : null; // null = sem base de comparação
    return ((current - prev) / Math.abs(prev)) * 100;
  };
  const varReceitas = calcVar(totalReceitas, prevReceitas);
  const varDespesas = calcVar(totalDespesas, prevDespesas);
  const varSaldo = calcVar(saldo, prevSaldo);

  // ---- Raio-X de Despesas por categoria (consolida pais) ----
  const raioXDespesas = useMemo(() => {
    const despesas = transacoesValidas.filter(t => t.tipo === "despesa" && t.categoria_id);
    const totals = new Map<string, number>();
    despesas.forEach(t => {
      const cat = categorias.find(c => c.id === t.categoria_id);
      if (!cat) return;
      const rootId = cat.categoria_pai_id || cat.id;
      totals.set(rootId, (totals.get(rootId) || 0) + Number(t.valor));
    });
    const items = Array.from(totals.entries()).map(([id, total]) => {
      const cat = categorias.find(c => c.id === id);
      return { id, nome: cat?.nome || "Sem categoria", cor: cat?.cor || "#94a3b8", total };
    }).sort((a, b) => b.total - a.total);
    const totalGeral = items.reduce((a, i) => a + i.total, 0);
    const top = items.slice(0, 6);
    const restoTotal = items.slice(6).reduce((a, i) => a + i.total, 0);
    const chart = restoTotal > 0
      ? [...top, { id: "__outros", nome: "Outros", cor: "#94a3b8", total: restoTotal }]
      : top;
    return { items, chart, totalGeral, vilao: items[0] || null };
  }, [transacoesValidas, categorias]);

  // Drilldown da categoria raiz selecionada no Raio-X
  const drilldownData = useMemo(() => {
    if (!drilldownCatId) return null;
    const cat = categorias.find(c => c.id === drilldownCatId);
    if (!cat) return null;
    const subcats = categorias.filter(c => c.categoria_pai_id === cat.id);
    const allIds = [cat.id, ...subcats.map(s => s.id)];

    const subBuckets = [
      ...subcats.map(s => {
        const total = transacoesValidas
          .filter(t => t.categoria_id === s.id && t.tipo === "despesa")
          .reduce((acc, t) => acc + Number(t.valor), 0);
        return { id: s.id, name: s.nome, color: s.cor, value: total };
      }),
      (() => {
        const total = transacoesValidas
          .filter(t => t.categoria_id === cat.id && t.tipo === "despesa")
          .reduce((acc, t) => acc + Number(t.valor), 0);
        return { id: cat.id, name: "Sem subcategoria", color: cat.cor, value: total };
      })(),
    ].filter(b => b.value > 0).sort((a, b) => b.value - a.value);

    const lancamentos = transacoesValidas
      .filter(t => t.categoria_id && allIds.includes(t.categoria_id) && t.tipo === "despesa")
      .map(t => {
        const tcat = categorias.find(c => c.id === t.categoria_id);
        return { ...t, categoriaNome: tcat?.nome || "—", categoriaCor: tcat?.cor };
      })
      .sort((a, b) => (a.data < b.data ? 1 : -1));

    const total = subBuckets.reduce((s, b) => s + b.value, 0);
    return { cat, subBuckets, lancamentos, total };
  }, [drilldownCatId, categorias, transacoesValidas]);

  // ---- Comprometimento de Renda: Fixas vs Variáveis ----
  // Este widget considera TODAS as despesas (executadas + pendentes) porque
  // reflete o compromisso financeiro do período, não apenas o que já foi pago.
  const comprometimentoRenda = useMemo(() => {
    // Categorias raiz cujo nome indica financiamento/empréstimo
    const contratoRootIds = new Set(
      categorias
        .filter(c => !c.categoria_pai_id && /financiament|empr[eé]stim/i.test(c.nome))
        .map(c => c.id)
    );
    const isContratoCat = (catId: string | null) => {
      if (!catId) return false;
      const cat = categorias.find(c => c.id === catId);
      if (!cat) return false;
      const rootId = cat.categoria_pai_id || cat.id;
      return contratoRootIds.has(rootId);
    };

    // Receitas: considera também pendentes (renda comprometida vs renda prevista)
    const receitasComPendentes = transacoesValidasComPendentes
      .filter(t => t.tipo === "receita")
      .reduce((a, t) => a + Number(t.valor), 0);

    const despesas = transacoesValidasComPendentes.filter(t => t.tipo === "despesa");
    let fixas = 0;
    let variaveis = 0;
    despesas.forEach(t => {
      const rec = (t.recorrencia || "").toLowerCase();
      const isFixa = (rec && rec !== "nenhuma") || isContratoCat(t.categoria_id);
      if (isFixa) fixas += Number(t.valor);
      else variaveis += Number(t.valor);
    });
    const totalDesp = fixas + variaveis;
    const pctFixasReceita = receitasComPendentes > 0 ? (fixas / receitasComPendentes) * 100 : 0;
    const pctVariaveisReceita = receitasComPendentes > 0 ? (variaveis / receitasComPendentes) * 100 : 0;
    const pctFixasDesp = totalDesp > 0 ? (fixas / totalDesp) * 100 : 0;
    const pctVariaveisDesp = totalDesp > 0 ? (variaveis / totalDesp) * 100 : 0;
    return { fixas, variaveis, totalDesp, pctFixasReceita, pctVariaveisReceita, pctFixasDesp, pctVariaveisDesp };
  }, [transacoesValidasComPendentes, categorias]);





  // Relatório por categoria - hierárquico (pai com subcategorias expansíveis)
  const relatorioCategoria = useMemo(() => {
    const sumFor = (catId: string) => transacoesValidas
      .filter(t => t.categoria_id === catId)
      .reduce((acc, t) => acc + Number(t.valor) * (t.tipo === "despesa" ? -1 : 1), 0);

    const mains = categorias.filter(c => !c.categoria_pai_id);
    const orphans = categorias.filter(c => c.categoria_pai_id && !categorias.some(m => m.id === c.categoria_pai_id));

    const groups = [...mains, ...orphans].map(cat => {
      const subs = categorias
        .filter(c => c.categoria_pai_id === cat.id)
        .map(s => ({ id: s.id, categoria: s.nome, cor: s.cor, total: sumFor(s.id) }))
        .filter(s => s.total !== 0)
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

      const direto = sumFor(cat.id);
      if (direto !== 0) {
        subs.push({ id: cat.id + "-direto", categoria: "Sem subcategoria", cor: cat.cor, total: direto });
      }

      const totalSubs = subs.reduce((a, s) => a + s.total, 0);
      const total = totalSubs;

      return { id: cat.id, categoria: cat.nome, tipo: cat.tipo, cor: cat.cor, total, subs };
    }).filter(g => g.total !== 0 || g.subs.length > 0).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

    return groups;
  }, [categorias, transacoesValidas]);


  // Relatório por conta - inclui transferências e pagamentos de cartão como receitas/despesas.
  // Exclui pendentes (a menos que o usuário filtre explicitamente por status).
  const filteredExecutadas = filters.statusPagamento
    ? filteredTransacoes
    : filteredTransacoes.filter(t => isExecutado(t.is_pago_executado));
  const relatorioConta = contas.map(conta => {
    const transacoesConta: TransacaoConta[] = [];

    filteredExecutadas.forEach(t => {
      const isTransfer = t.forma_pagamento === "transferencia";

      if (isTransfer) {
        // Considera apenas o registro que possui conta_destino_id (evita duplicação do par receita/despesa).
        if (!t.conta_destino_id) return;
        const destinoConta = contas.find(c => c.id === t.conta_destino_id);
        const origemConta = contas.find(c => c.id === t.conta_id);
        const destinoEhCartao = destinoConta?.tipo === "credito";

        if (t.conta_id === conta.id) {
          transacoesConta.push({
            ...t,
            _tipoEfetivo: "despesa",
            _origemLabel: destinoEhCartao
              ? `Pagamento de cartão · ${destinoConta?.nome_conta ?? ""}`
              : `Transferência enviada · ${destinoConta?.nome_conta ?? ""}`,
          });
        } else if (t.conta_destino_id === conta.id) {
          transacoesConta.push({
            ...t,
            _tipoEfetivo: "receita",
            _origemLabel: destinoEhCartao
              ? `Recebimento de pagamento de cartão · ${origemConta?.nome_conta ?? ""}`
              : `Transferência recebida · ${origemConta?.nome_conta ?? ""}`,
          });
        }
      } else if (t.conta_id === conta.id && (t.tipo === "receita" || t.tipo === "despesa")) {
        transacoesConta.push({ ...t, _tipoEfetivo: t.tipo as "receita" | "despesa", _origemLabel: null });
      }
    });

    transacoesConta.sort((a, b) => (b.data > a.data ? 1 : -1));
    const receitas = transacoesConta.filter(t => t._tipoEfetivo === "receita").reduce((a, t) => a + Number(t.valor), 0);
    const despesas = transacoesConta.filter(t => t._tipoEfetivo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
    return { id: conta.id, conta: conta.nome_conta, receitas, despesas, saldo: receitas - despesas, transacoes: transacoesConta };
  }).filter(r => r.receitas !== 0 || r.despesas !== 0);


  // Relatório por forma de pagamento (exclui transferências para consistência com demais relatórios)
  const formasPagamento = [
    { value: "pix", label: "PIX" },
    { value: "debito", label: "Débito" },
    { value: "credito", label: "Crédito" },
    { value: "dinheiro", label: "Dinheiro" },
    { value: "rendimento", label: "Rendimento" },
    { value: "outro", label: "Outro" },
  ];
  const relatorioFormaPagamento = formasPagamento.map(fp => {
    const transacoesFp = transacoesValidas
      .filter(t => t.forma_pagamento === fp.value)
      .sort((a, b) => (b.data > a.data ? 1 : -1));
    const receitas = transacoesFp.filter(t => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
    const despesas = transacoesFp.filter(t => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
    return { id: fp.value, forma: fp.label, receitas, despesas, total: receitas - despesas, transacoes: transacoesFp };
  });

  const exportToCSV = () => {
    let csv = "";
    
    if (tipoRelatorio === "geral") {
      csv = "Data,Tipo,Descrição,Categoria,Conta,Valor\n";
      filteredTransacoes.forEach(t => {
        csv += `${formatDate(t.data)},${t.tipo},${t.descricao || "-"},${getCategoriaNome(t.categoria_id)},${getContaNome(t.conta_id)},${t.tipo === "receita" ? "" : "-"}${t.valor}\n`;
      });
    } else if (tipoRelatorio === "categoria") {
      csv = "Categoria,Subcategoria,Tipo,Total\n";
      relatorioCategoria.forEach(r => {
        csv += `${r.categoria},,${r.tipo},${r.total}\n`;
        r.subs.forEach(s => {
          csv += `${r.categoria},${s.categoria},${r.tipo},${s.total}\n`;
        });
      });
    } else if (tipoRelatorio === "conta") {
      csv = "Conta,Receitas,Despesas,Saldo\n";
      relatorioConta.forEach(r => {
        csv += `${r.conta},${r.receitas},${r.despesas},${r.saldo}\n`;
      });
    } else if (tipoRelatorio === "pagamento") {
      csv = "Forma de Pagamento,Receitas,Despesas,Saldo\n";
      relatorioFormaPagamento.forEach(r => {
        csv += `${r.forma},${r.receitas},${r.despesas},${r.total}\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_${tipoRelatorio}_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    toast({ title: "Sucesso", description: "Relatório exportado com sucesso" });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <PageLoadingSkeleton type="report" title="Relatórios" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Relatórios</h1>
            <p className="text-sm text-muted-foreground">Análise detalhada das suas finanças</p>
          </div>
          <div className="flex w-full sm:w-auto gap-2">
            <Select value={tipoRelatorio} onValueChange={setTipoRelatorio}>
              <SelectTrigger className="flex-1 sm:flex-none sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Geral</SelectItem>
                <SelectItem value="categoria">Por Categoria</SelectItem>
                <SelectItem value="conta">Por Conta</SelectItem>
                <SelectItem value="pagamento">Por Pagamento</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportToCSV} className="sm:w-auto w-10 sm:px-5 px-0" aria-label="Exportar CSV" title="Exportar CSV">
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </Button>
          </div>
        </div>

        {/* Advanced Filters */}
        <AdvancedFilters
          filters={filters}
          onFiltersChange={setFilters}
          onResetToDefault={() => setFilters(getInitialFilterState())}
          categorias={categorias}
          contas={contas}
          showTipo
          showCategoria
          showConta
          showFormaPagamento
          showStatusPagamento
        />

        {/* KPIs Comparativos (Mês Atual vs Mês Anterior) */}
        {(() => {
          const VarBadge = ({ value, lowerIsBetter = false }: { value: number | null; lowerIsBetter?: boolean }) => {
            if (value === null) {
              return <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs">Sem base anterior</Badge>;
            }
            const isZero = Math.abs(value) < 0.05;
            const isDown = value < 0;
            const good = isZero ? true : (lowerIsBetter ? isDown : !isDown);
            const Icon = isZero ? null : isDown ? ArrowDown : ArrowUp;
            const cls = isZero
              ? "bg-muted text-muted-foreground border-transparent"
              : good
                ? "bg-success/15 text-success border-success/30"
                : "bg-destructive/15 text-destructive border-destructive/30";
            return (
              <Badge variant="outline" className={`gap-1 text-[10px] sm:text-xs ${cls}`}>
                {Icon && <Icon className="h-3 w-3" />}
                {Math.abs(value).toFixed(1)}% vs mês passado
              </Badge>
            );
          };
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <Card className="shadow-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-success/10">
                      <TrendingUp className="h-5 w-5 text-success" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm text-muted-foreground">Receitas</p>
                      <p className="text-lg sm:text-xl font-bold text-success truncate">{formatCurrency(totalReceitas)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <VarBadge value={varReceitas} lowerIsBetter={false} />
                    <span className="text-[10px] text-muted-foreground tabular-nums truncate">Ant: {formatCurrency(prevReceitas)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-destructive/10">
                      <TrendingDown className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm text-muted-foreground">Despesas</p>
                      <p className="text-lg sm:text-xl font-bold text-destructive truncate">{formatCurrency(totalDespesas)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <VarBadge value={varDespesas} lowerIsBetter={true} />
                    <span className="text-[10px] text-muted-foreground tabular-nums truncate">Ant: {formatCurrency(prevDespesas)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm text-muted-foreground">Resultado</p>
                      <p className={`text-lg sm:text-xl font-bold truncate ${saldo >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(saldo)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <VarBadge value={varSaldo} lowerIsBetter={false} />
                    <span className="text-[10px] text-muted-foreground tabular-nums truncate">Ant: {formatCurrency(prevSaldo)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* Raio-X de Despesas (apenas no relatório Geral) */}
        {tipoRelatorio === "geral" && raioXDespesas.totalGeral > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="shadow-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Raio-X de Despesas</CardTitle>
                <p className="text-xs text-muted-foreground">Distribuição por categoria no período</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={raioXDespesas.chart}
                          dataKey="total"
                          nameKey="nome"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={2}
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                          cursor="pointer"
                          onClick={(d: any) => {
                            if (d?.id && d.id !== "__outros") setDrilldownCatId(d.id);
                          }}
                        >
                          {raioXDespesas.chart.map((entry) => (
                            <Cell key={entry.id} fill={entry.cor} style={{ cursor: entry.id === "__outros" ? "default" : "pointer" }} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const entry: any = payload[0];
                            const value = entry.value as number;
                            const pct = raioXDespesas.totalGeral > 0 ? ((value / raioXDespesas.totalGeral) * 100).toFixed(1) : "0";
                            return (
                              <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                                <p className="font-medium text-foreground text-sm">{entry.name}</p>
                                <p className="text-sm text-foreground">{formatCurrency(value)}</p>
                                <p className="text-xs text-muted-foreground">{pct}% do total</p>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {raioXDespesas.chart.map((entry) => {
                      const pct = raioXDespesas.totalGeral > 0 ? (entry.total / raioXDespesas.totalGeral) * 100 : 0;
                      const clickable = entry.id !== "__outros";
                      return (
                        <div
                          key={entry.id}
                          role={clickable ? "button" : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          onClick={clickable ? () => setDrilldownCatId(entry.id) : undefined}
                          onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrilldownCatId(entry.id); } } : undefined}
                          className={`flex items-center gap-2 text-sm rounded-md p-1.5 -mx-1.5 ${clickable ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""}`}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.cor }} />
                          <span className="text-foreground truncate flex-1">{entry.nome}</span>
                          <span className="text-muted-foreground tabular-nums text-xs shrink-0">{pct.toFixed(1)}%</span>
                          <span className="font-medium tabular-nums shrink-0 w-24 text-right">{formatCurrency(entry.total)}</span>
                        </div>
                      );
                    })}
                  </div>

                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card border-destructive/30 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="h-4 w-4 text-destructive" />
                  O Vilão do Período
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {raioXDespesas.vilao ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: raioXDespesas.vilao.cor }} />
                      <span className="font-semibold text-foreground truncate">{raioXDespesas.vilao.nome}</span>
                    </div>
                    <p className="text-2xl font-bold text-destructive tabular-nums">
                      {formatCurrency(raioXDespesas.vilao.total)}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Seu maior gasto foi com <strong className="text-foreground">{raioXDespesas.vilao.nome}</strong>,
                      representando <strong className="text-foreground">{((raioXDespesas.vilao.total / raioXDespesas.totalGeral) * 100).toFixed(1)}%</strong> do total de despesas do período.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem despesas no período.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Comprometimento de Renda (apenas no relatório Geral) */}
        {tipoRelatorio === "geral" && comprometimentoRenda.totalDesp > 0 && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Comprometimento de Renda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Stacked bar relativa à Receita Total */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Despesas / Receita do período</span>
                  <span>{formatCurrency(totalReceitas)}</span>
                </div>
                <div className="relative w-full h-6 rounded-md overflow-hidden bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 bg-destructive/80 flex items-center justify-end pr-2 text-[10px] font-medium text-destructive-foreground"
                    style={{ width: `${Math.min(100, comprometimentoRenda.pctFixasReceita)}%` }}
                    title={`Fixas: ${formatCurrency(comprometimentoRenda.fixas)}`}
                  >
                    {comprometimentoRenda.pctFixasReceita >= 8 && `${comprometimentoRenda.pctFixasReceita.toFixed(0)}%`}
                  </div>
                  <div
                    className="absolute inset-y-0 bg-amber-500/80 flex items-center justify-end pr-2 text-[10px] font-medium text-white"
                    style={{
                      left: `${Math.min(100, comprometimentoRenda.pctFixasReceita)}%`,
                      width: `${Math.min(100 - Math.min(100, comprometimentoRenda.pctFixasReceita), comprometimentoRenda.pctVariaveisReceita)}%`,
                    }}
                    title={`Variáveis: ${formatCurrency(comprometimentoRenda.variaveis)}`}
                  >
                    {comprometimentoRenda.pctVariaveisReceita >= 8 && `${comprometimentoRenda.pctVariaveisReceita.toFixed(0)}%`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-destructive/80" />
                    <span className="text-muted-foreground">Fixas:</span>
                    <strong className="text-foreground">{formatCurrency(comprometimentoRenda.fixas)}</strong>
                    <span className="text-muted-foreground">({comprometimentoRenda.pctFixasDesp.toFixed(1)}% das despesas)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-amber-500/80" />
                    <span className="text-muted-foreground">Variáveis:</span>
                    <strong className="text-foreground">{formatCurrency(comprometimentoRenda.variaveis)}</strong>
                    <span className="text-muted-foreground">({comprometimentoRenda.pctVariaveisDesp.toFixed(1)}% das despesas)</span>
                  </span>
                </div>
              </div>

              {/* Insight */}
              {totalReceitas > 0 ? (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    comprometimentoRenda.pctFixasReceita >= 70
                      ? "border-destructive/30 bg-destructive/5 text-foreground"
                      : comprometimentoRenda.pctFixasReceita >= 50
                      ? "border-amber-500/30 bg-amber-500/5 text-foreground"
                      : "border-emerald-500/30 bg-emerald-500/5 text-foreground"
                  }`}
                >
                  <strong>{comprometimentoRenda.pctFixasReceita.toFixed(1)}%</strong> da sua receita já está comprometida com contas fixas
                  {" "}(recorrências e financiamentos).
                  {comprometimentoRenda.pctFixasReceita >= 70 && " Atenção: seu orçamento está muito pressionado."}
                  {comprometimentoRenda.pctFixasReceita >= 50 && comprometimentoRenda.pctFixasReceita < 70 && " Cuidado: passou da metade da renda."}
                  {comprometimentoRenda.pctFixasReceita < 50 && " Saudável: você mantém boa folga para variáveis e investimento."}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem receitas no período para calcular o comprometimento.</p>
              )}
            </CardContent>
          </Card>
        )}



        {/* Tabela de acordo com o tipo */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">
              {tipoRelatorio === "geral" && "Todas as Transações"}
              {tipoRelatorio === "categoria" && "Por Categoria"}
              {tipoRelatorio === "conta" && "Por Conta"}
              {tipoRelatorio === "pagamento" && "Por Forma de Pagamento"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            {tipoRelatorio === "geral" && (
              <>
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-border">
                  {filteredTransacoes.map((t) => (
                    <div key={t.id} className="p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground truncate max-w-[60%]">{t.descricao || "-"}</span>
                        <span className={`text-sm font-bold ${t.forma_pagamento === "transferencia" ? "text-primary" : t.tipo === "receita" ? "text-success" : "text-destructive"}`}>
                          {t.forma_pagamento === "transferencia" ? "" : t.tipo === "receita" ? "+" : "-"}{formatCurrency(Number(t.valor))}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDate(t.data)}</span>
                        <span>·</span>
                        <span className="truncate">{getCategoriaNome(t.categoria_id)}</span>
                        <span>·</span>
                        <span className="truncate">{getContaNome(t.conta_id)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Conta</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransacoes.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>{formatDate(t.data)}</TableCell>
                          <TableCell className="capitalize">{t.tipo}</TableCell>
                          <TableCell>{t.descricao || "-"}</TableCell>
                          <TableCell>{getCategoriaNome(t.categoria_id)}</TableCell>
                          <TableCell>{getContaNome(t.conta_id)}</TableCell>
                          <TableCell className={`text-right font-medium ${t.forma_pagamento === "transferencia" ? "text-primary" : t.tipo === "receita" ? "text-success" : "text-destructive"}`}>
                            {t.forma_pagamento === "transferencia" ? "" : t.tipo === "receita" ? "+" : "-"}{formatCurrency(Number(t.valor))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {tipoRelatorio === "categoria" && (
              <>
                {/* Mobile */}
                <div className="md:hidden divide-y divide-border">
                  {relatorioCategoria.map((r) => {
                    const isOpen = expandedCats.has(r.id);
                    const hasSubs = r.subs.length > 0;
                    return (
                      <div key={r.id}>
                        <button
                          type="button"
                          onClick={() => hasSubs && toggleCat(r.id)}
                          className={`w-full flex items-center justify-between gap-3 p-4 text-left ${hasSubs ? "hover:bg-accent/40" : ""}`}
                          aria-expanded={isOpen}
                          disabled={!hasSubs}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {hasSubs ? (
                              isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.cor }} />
                            <span className="text-sm font-medium text-foreground truncate">{r.categoria}</span>
                          </div>
                          <span className={`text-base font-bold tabular-nums shrink-0 ${r.total >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(Math.abs(r.total))}
                          </span>
                        </button>
                        {isOpen && hasSubs && (
                          <div className="bg-muted/30 divide-y divide-border">
                            {r.subs.map((s) => (
                              <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 pl-12 pr-4">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.cor }} />
                                  <span className="text-sm text-muted-foreground truncate">{s.categoria}</span>
                                </div>
                                <span className={`text-sm font-semibold tabular-nums shrink-0 ${s.total >= 0 ? "text-success" : "text-destructive"}`}>
                                  {formatCurrency(Math.abs(s.total))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Desktop */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relatorioCategoria.map((r) => {
                        const isOpen = expandedCats.has(r.id);
                        const hasSubs = r.subs.length > 0;
                        return (
                          <Fragment key={r.id}>
                            <TableRow
                              key={r.id}
                              className={hasSubs ? "cursor-pointer hover:bg-accent/40" : ""}
                              onClick={() => hasSubs && toggleCat(r.id)}
                            >
                              <TableCell className="w-10">
                                {hasSubs ? (
                                  isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.cor }} />
                                  <span className="font-medium">{r.categoria}</span>
                                </div>
                              </TableCell>
                              <TableCell className="capitalize">{r.tipo}</TableCell>
                              <TableCell className={`text-right font-medium ${r.total >= 0 ? "text-success" : "text-destructive"}`}>
                                {formatCurrency(Math.abs(r.total))}
                              </TableCell>
                            </TableRow>
                            {isOpen && hasSubs && r.subs.map((s) => (
                              <TableRow key={s.id} className="bg-muted/30">
                                <TableCell></TableCell>
                                <TableCell className="pl-10">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.cor }} />
                                    <span className="text-sm text-muted-foreground">{s.categoria}</span>
                                  </div>
                                </TableCell>
                                <TableCell></TableCell>
                                <TableCell className={`text-right text-sm ${s.total >= 0 ? "text-success" : "text-destructive"}`}>
                                  {formatCurrency(Math.abs(s.total))}
                                </TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {tipoRelatorio === "conta" && (
              <>
                {/* Mobile */}
                <div className="md:hidden divide-y divide-border">
                  {relatorioConta.map((r) => {
                    const isOpen = expandedContas.has(r.id);
                    const hasTx = r.transacoes.length > 0;
                    return (
                      <div key={r.id}>
                        <button
                          type="button"
                          onClick={() => hasTx && toggleConta(r.id)}
                          className={`w-full p-4 space-y-2 text-left ${hasTx ? "hover:bg-accent/40" : ""}`}
                          aria-expanded={isOpen}
                          disabled={!hasTx}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {hasTx ? (
                                isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <span className="w-4 shrink-0" />
                              )}
                              <p className="text-sm font-medium text-foreground truncate">{r.conta}</p>
                            </div>
                            <span className={`text-base font-bold tabular-nums shrink-0 ${r.saldo >= 0 ? "text-success" : "text-destructive"}`}>
                              {formatCurrency(r.saldo)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground pl-6">
                            <span>↑ {formatCurrency(r.receitas)}</span>
                            <span>·</span>
                            <span>↓ {formatCurrency(r.despesas)}</span>
                          </div>
                        </button>
                        {isOpen && hasTx && (
                          <div className="bg-muted/30 divide-y divide-border">
                            {r.transacoes.map((t) => (
                              <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 pl-12 pr-4">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-foreground truncate">{t._origemLabel || t.descricao || "-"}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {formatDate(t.data)} · {t._origemLabel ? (t.descricao || "—") : getCategoriaNome(t.categoria_id)}
                                  </p>
                                </div>
                                <span className={`text-sm font-semibold tabular-nums shrink-0 ${t._tipoEfetivo === "receita" ? "text-success" : "text-destructive"}`}>
                                  {t._tipoEfetivo === "receita" ? "+" : "-"}{formatCurrency(Number(t.valor))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Desktop */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Conta</TableHead>
                        <TableHead className="text-right">Receitas</TableHead>
                        <TableHead className="text-right">Despesas</TableHead>
                        <TableHead className="text-right">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relatorioConta.map((r) => {
                        const isOpen = expandedContas.has(r.id);
                        const hasTx = r.transacoes.length > 0;
                        return (
                          <Fragment key={r.id}>
                            <TableRow
                              className={hasTx ? "cursor-pointer hover:bg-accent/40" : ""}
                              onClick={() => hasTx && toggleConta(r.id)}
                            >
                              <TableCell className="w-10">
                                {hasTx ? (
                                  isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                ) : null}
                              </TableCell>
                              <TableCell className="font-medium">{r.conta}</TableCell>
                              <TableCell className="text-right text-success">{formatCurrency(r.receitas)}</TableCell>
                              <TableCell className="text-right text-destructive">{formatCurrency(r.despesas)}</TableCell>
                              <TableCell className={`text-right font-medium ${r.saldo >= 0 ? "text-success" : "text-destructive"}`}>
                                {formatCurrency(r.saldo)}
                              </TableCell>
                            </TableRow>
                            {isOpen && hasTx && r.transacoes.map((t) => (
                              <TableRow key={t.id} className="bg-muted/30">
                                <TableCell></TableCell>
                                <TableCell className="pl-10">
                                  <div className="flex flex-col">
                                    <span className="text-sm text-foreground">{t._origemLabel || t.descricao || "-"}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {formatDate(t.data)} · {t._origemLabel ? (t.descricao || "—") : getCategoriaNome(t.categoria_id)}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-sm text-success">
                                  {t._tipoEfetivo === "receita" ? formatCurrency(Number(t.valor)) : ""}
                                </TableCell>
                                <TableCell className="text-right text-sm text-destructive">
                                  {t._tipoEfetivo === "despesa" ? formatCurrency(Number(t.valor)) : ""}
                                </TableCell>
                                <TableCell></TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}


            {tipoRelatorio === "pagamento" && (
              <>
                {/* Mobile */}
                <div className="md:hidden divide-y divide-border">
                  {relatorioFormaPagamento.map((r) => {
                    const isOpen = expandedPagamentos.has(r.id);
                    const hasTx = r.transacoes.length > 0;
                    return (
                      <div key={r.id}>
                        <button
                          type="button"
                          onClick={() => hasTx && togglePagamento(r.id)}
                          className={`w-full p-4 space-y-2 text-left ${hasTx ? "hover:bg-accent/40" : "opacity-60"}`}
                          aria-expanded={isOpen}
                          disabled={!hasTx}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {hasTx ? (
                                isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <span className="w-4 shrink-0" />
                              )}
                              <p className="text-sm font-medium text-foreground truncate">{r.forma}</p>
                            </div>
                            <span className={`text-base font-bold tabular-nums shrink-0 ${r.total >= 0 ? "text-success" : "text-destructive"}`}>
                              {formatCurrency(r.total)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground pl-6">
                            <span>↑ {formatCurrency(r.receitas)}</span>
                            <span>·</span>
                            <span>↓ {formatCurrency(r.despesas)}</span>
                          </div>
                        </button>
                        {isOpen && hasTx && (
                          <div className="bg-muted/30 divide-y divide-border">
                            {r.transacoes.map((t) => (
                              <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 pl-12 pr-4">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-foreground truncate">{t.descricao || "-"}</p>
                                  <p className="text-xs text-muted-foreground">{formatDate(t.data)} · {getCategoriaNome(t.categoria_id)} · {getContaNome(t.conta_id)}</p>
                                </div>
                                <span className={`text-sm font-semibold tabular-nums shrink-0 ${t.tipo === "receita" ? "text-success" : "text-destructive"}`}>
                                  {t.tipo === "receita" ? "" : "-"}{formatCurrency(Number(t.valor))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Desktop */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Forma de Pagamento</TableHead>
                        <TableHead className="text-right">Receitas</TableHead>
                        <TableHead className="text-right">Despesas</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relatorioFormaPagamento.map((r) => {
                        const isOpen = expandedPagamentos.has(r.id);
                        const hasTx = r.transacoes.length > 0;
                        return (
                          <Fragment key={r.id}>
                            <TableRow
                              className={hasTx ? "cursor-pointer hover:bg-accent/40" : "opacity-60"}
                              onClick={() => hasTx && togglePagamento(r.id)}
                            >
                              <TableCell className="w-10">
                                {hasTx ? (
                                  isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                ) : null}
                              </TableCell>
                              <TableCell className="font-medium">{r.forma}</TableCell>
                              <TableCell className="text-right text-success">{formatCurrency(r.receitas)}</TableCell>
                              <TableCell className="text-right text-destructive">{formatCurrency(r.despesas)}</TableCell>
                              <TableCell className={`text-right font-medium ${r.total >= 0 ? "text-success" : "text-destructive"}`}>
                                {formatCurrency(r.total)}
                              </TableCell>
                            </TableRow>
                            {isOpen && hasTx && r.transacoes.map((t) => (
                              <TableRow key={t.id} className="bg-muted/30">
                                <TableCell></TableCell>
                                <TableCell className="pl-10">
                                  <div className="flex flex-col">
                                    <span className="text-sm text-foreground">{t.descricao || "-"}</span>
                                    <span className="text-xs text-muted-foreground">{formatDate(t.data)} · {getCategoriaNome(t.categoria_id)} · {getContaNome(t.conta_id)}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-sm text-success">
                                  {t.tipo === "receita" ? formatCurrency(Number(t.valor)) : ""}
                                </TableCell>
                                <TableCell className="text-right text-sm text-destructive">
                                  {t.tipo === "despesa" ? formatCurrency(Number(t.valor)) : ""}
                                </TableCell>
                                <TableCell></TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {filteredTransacoes.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma transação no período selecionado
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!drilldownCatId} onOpenChange={(open) => !open && setDrilldownCatId(null)}>
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
              Despesas desta categoria — total {drilldownData ? formatCurrency(drilldownData.total) : ""}
            </DialogDescription>
          </DialogHeader>

          {drilldownData && (
            <div className="flex-1 overflow-y-auto space-y-6 pr-1">
              {drilldownData.subBuckets.length > 0 && (
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
                          <Cell key={`sub-cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const entry: any = payload[0];
                          const value = entry.value as number;
                          const pct = drilldownData.total > 0 ? ((value / drilldownData.total) * 100).toFixed(1) : "0";
                          return (
                            <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                              <p className="font-medium text-foreground text-xs">{entry.name}</p>
                              <p className="text-xs text-foreground">{formatCurrency(value)}</p>
                              <p className="text-[10px] text-muted-foreground">{pct}%</p>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {drilldownData.subBuckets.map((b) => {
                      const pct = drilldownData.total > 0 ? (b.value / drilldownData.total) * 100 : 0;
                      return (
                        <div key={b.id} className="flex items-center gap-2 text-xs border rounded-md p-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                          <span className="truncate flex-1">{b.name}</span>
                          <span className="text-muted-foreground tabular-nums shrink-0">{pct.toFixed(1)}%</span>
                          <span className="font-medium tabular-nums shrink-0">{formatCurrency(b.value)}</span>
                        </div>
                      );
                    })}
                  </div>
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
                            {formatDate(t.data)} · {t.categoriaNome} · {getContaNome(t.conta_id)}
                          </p>
                        </div>
                        <span className="font-semibold tabular-nums whitespace-nowrap text-destructive">
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

export default Relatorios;
