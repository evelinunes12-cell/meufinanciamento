import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { AdvancedFilters, FilterState, getDateRangeFromFilters, getInitialFilterState, getCategoryIdsForFilter } from "@/components/AdvancedFilters";
import { ProjecaoFluxoCaixaWidget } from "@/components/dashboard/ProjecaoFluxoCaixaWidget";
import { isExecutado, getDataEfetiva, filterTransacoesPorPeriodoEfetivo } from "@/lib/transactions";

interface Transacao {
  id: string;
  conta_id: string;
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

  // Filter valid transactions: exclude transfers for aggregations
  const transacoesValidas = filteredTransacoes.filter(t => t.forma_pagamento !== "transferencia");
  
  const totalReceitas = transacoesValidas.filter(t => t.tipo === "receita").reduce((acc, t) => acc + Number(t.valor), 0);
  const totalDespesas = transacoesValidas.filter(t => t.tipo === "despesa").reduce((acc, t) => acc + Number(t.valor), 0);
  const saldo = totalReceitas - totalDespesas;

  // Calculate current balance for projection (all time executed transactions)
  // Calculate current balance for projection (all time executed transactions)
  const saldoAtual = useMemo(() => {
    return contas.reduce((acc, conta) => {
      if (conta.tipo === "credito") return acc;
      
      const transacoesConta = allTransacoes.filter(t => 
        t.conta_id === conta.id && 
        t.forma_pagamento !== "transferencia" &&
        isExecutado(t.is_pago_executado)
      );
      const receitas = transacoesConta.filter(t => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
      const despesas = transacoesConta.filter(t => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
      return acc + Number(conta.saldo_inicial) + receitas - despesas;
    }, 0);
  }, [contas, allTransacoes]);

  // Relatório por categoria
  const relatorioCategoria = categorias.map(cat => {
    const total = transacoesValidas
      .filter(t => t.categoria_id === cat.id)
      .reduce((acc, t) => acc + Number(t.valor) * (t.tipo === "despesa" ? -1 : 1), 0);
    return { categoria: cat.nome, tipo: cat.tipo, cor: cat.cor, total };
  }).filter(r => r.total !== 0).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  // Relatório por conta
  const relatorioConta = contas.map(conta => {
    const transacoesConta = transacoesValidas.filter(t => t.conta_id === conta.id);
    const receitas = transacoesConta.filter(t => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
    const despesas = transacoesConta.filter(t => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
    return { conta: conta.nome_conta, receitas, despesas, saldo: receitas - despesas };
  }).filter(r => r.receitas !== 0 || r.despesas !== 0);

  // Relatório por forma de pagamento
  const formasPagamento = ["pix", "debito", "credito", "dinheiro", "transferencia", "outro"];
  const relatorioFormaPagamento = formasPagamento.map(fp => {
    const total = filteredTransacoes
      .filter(t => t.forma_pagamento === fp)
      .reduce((acc, t) => acc + Number(t.valor) * (t.tipo === "despesa" ? -1 : 1), 0);
    return { forma: fp.charAt(0).toUpperCase() + fp.slice(1), total };
  }).filter(r => r.total !== 0);

  const exportToCSV = () => {
    let csv = "";
    
    if (tipoRelatorio === "geral") {
      csv = "Data,Tipo,Descrição,Categoria,Conta,Valor\n";
      filteredTransacoes.forEach(t => {
        csv += `${formatDate(t.data)},${t.tipo},${t.descricao || "-"},${getCategoriaNome(t.categoria_id)},${getContaNome(t.conta_id)},${t.tipo === "receita" ? "" : "-"}${t.valor}\n`;
      });
    } else if (tipoRelatorio === "categoria") {
      csv = "Categoria,Tipo,Total\n";
      relatorioCategoria.forEach(r => {
        csv += `${r.categoria},${r.tipo},${r.total}\n`;
      });
    } else if (tipoRelatorio === "conta") {
      csv = "Conta,Receitas,Despesas,Saldo\n";
      relatorioConta.forEach(r => {
        csv += `${r.conta},${r.receitas},${r.despesas},${r.saldo}\n`;
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
            <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
            <p className="text-muted-foreground">Análise detalhada das suas finanças</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={tipoRelatorio} onValueChange={setTipoRelatorio}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Geral</SelectItem>
                <SelectItem value="categoria">Por Categoria</SelectItem>
                <SelectItem value="conta">Por Conta</SelectItem>
                <SelectItem value="pagamento">Por Pagamento</SelectItem>
                <SelectItem value="projecao">Projeção</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Advanced Filters */}
        <AdvancedFilters
          filters={filters}
          onFiltersChange={setFilters}
          categorias={categorias}
          contas={contas}
          showTipo
          showCategoria
          showConta
          showFormaPagamento
        />

        {/* Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Receitas</p>
                  <p className="text-xl font-bold text-success">{formatCurrency(totalReceitas)}</p>
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
                  <p className="text-sm text-muted-foreground">Total Despesas</p>
                  <p className="text-xl font-bold text-destructive">{formatCurrency(totalDespesas)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Saldo</p>
                  <p className={`text-xl font-bold ${saldo >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(saldo)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
          <CardContent className="p-0">
            {tipoRelatorio === "geral" && (
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
                      <TableCell className={`text-right font-medium ${t.tipo === "receita" ? "text-success" : "text-destructive"}`}>
                        {t.tipo === "receita" ? "+" : "-"}{formatCurrency(Number(t.valor))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {tipoRelatorio === "categoria" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relatorioCategoria.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.cor }} />
                          {r.categoria}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{r.tipo}</TableCell>
                      <TableCell className={`text-right font-medium ${r.total >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(Math.abs(r.total))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {tipoRelatorio === "conta" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Receitas</TableHead>
                    <TableHead className="text-right">Despesas</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relatorioConta.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.conta}</TableCell>
                      <TableCell className="text-right text-success">{formatCurrency(r.receitas)}</TableCell>
                      <TableCell className="text-right text-destructive">{formatCurrency(r.despesas)}</TableCell>
                      <TableCell className={`text-right font-medium ${r.saldo >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(r.saldo)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {tipoRelatorio === "pagamento" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Forma de Pagamento</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relatorioFormaPagamento.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="capitalize">{r.forma}</TableCell>
                      <TableCell className={`text-right font-medium ${r.total >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(Math.abs(r.total))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {tipoRelatorio !== "projecao" && filteredTransacoes.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma transação no período selecionado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projeção Widget */}
        {tipoRelatorio === "projecao" && (
          <ProjecaoFluxoCaixaWidget 
            transacoes={allTransacoes} 
            contas={contas} 
            saldoAtual={saldoAtual} 
          />
        )}
      </div>
    </AppLayout>
  );
};

export default Relatorios;
