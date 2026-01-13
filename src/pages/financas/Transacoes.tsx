import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Check, ArrowRightLeft, Search } from "lucide-react";
import { format, parseISO, addWeeks, addMonths, addYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/calculations";
import { AdvancedFilters, FilterState, getDateRangeFromFilters, getInitialFilterState } from "@/components/AdvancedFilters";
import ConfirmPaymentModal from "@/components/ConfirmPaymentModal";
import DeleteSeriesDialog from "@/components/DeleteSeriesDialog";

interface Transacao {
  id: string;
  conta_id: string;
  categoria_id: string | null;
  valor: number;
  tipo: string;
  data: string;
  forma_pagamento: string;
  recorrencia: string;
  descricao: string | null;
  parcelas_total: number | null;
  parcela_atual: number | null;
  is_pago_executado: boolean | null;
  data_execucao_pagamento: string | null;
  conta_destino_id: string | null;
  transacao_origem_id: string | null;
}

interface Conta {
  id: string;
  nome_conta: string;
  tipo: string;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  cor: string;
  categoria_pai_id: string | null;
}

const formasPagamento = [
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "outro", label: "Outro" },
];

const recorrencias = [
  { value: "nenhuma", label: "Nenhuma" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
  { value: "fixa", label: "Recorrência Fixa (Ilimitada)" },
];

const cores = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", 
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"
];

const ITEMS_PER_PAGE = 10;

async function fetchTransacoesData(
  userId: string | undefined,
  startDate: string,
  endDate: string
) {
  if (!userId) return null;

  const [transacoesRes, contasRes, categoriasRes] = await Promise.all([
    supabase
      .from("transacoes")
      .select("*")
      .gte("data", startDate)
      .lte("data", endDate)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("contas").select("*"),
    supabase.from("categorias").select("*").order("nome"),
  ]);

  return {
    transacoes: (transacoesRes.data || []) as Transacao[],
    contas: (contasRes.data || []) as Conta[],
    categorias: (categoriasRes.data || []) as Categoria[],
  };
}

const DRAFT_KEY = "transacao-form-draft";

const Transacoes = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Filters
  const [filters, setFilters] = useState<FilterState>(getInitialFilterState());

  // Category inline creation
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCor, setNewCategoryCor] = useState("#3B82F6");

  const getInitialFormData = () => {
    const defaultData = {
      conta_id: "",
      categoria_id: "",
      valor: "",
      tipo: "despesa",
      data: format(new Date(), "yyyy-MM-dd"),
      forma_pagamento: "pix",
      recorrencia: "nenhuma",
      descricao: "",
      parcelas_total: "",
      conta_destino_id: "",
    };

    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        return { ...defaultData, ...JSON.parse(saved) };
      }
    } catch {
      // ignore parse errors
    }
    return defaultData;
  };

  const [formData, setFormData] = useState(getInitialFormData);

  // Save draft to localStorage on form changes (only when dialog is open and not editing)
  useEffect(() => {
    if (dialogOpen && !editingId && (formData.valor || formData.conta_id || formData.categoria_id || formData.descricao)) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
    }
  }, [formData, dialogOpen, editingId]);

  // Modal states
  const [confirmPaymentModal, setConfirmPaymentModal] = useState<{
    open: boolean;
    transacaoId: string;
    valorPrevisto: number;
    descricao: string | null;
  }>({ open: false, transacaoId: "", valorPrevisto: 0, descricao: null });

  const [deleteSeriesDialog, setDeleteSeriesDialog] = useState<{
    open: boolean;
    transacaoId: string;
    transacaoOrigemId: string | null;
    transacaoData: string;
    descricao: string | null;
    parcelasTotal: number | null;
  }>({ open: false, transacaoId: "", transacaoOrigemId: null, transacaoData: "", descricao: null, parcelasTotal: null });

  // Calculate date range based on filters
  const { startDate, endDate } = getDateRangeFromFilters(filters);

  const { data, isLoading } = useQuery({
    queryKey: ["transacoes", user?.id, startDate, endDate],
    queryFn: () => fetchTransacoesData(user?.id, startDate, endDate),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const transacoes = data?.transacoes || [];
  const contas = data?.contas || [];
  const categorias = data?.categorias || [];

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["transacoes"] });
    queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-financas"] });
    queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
  };

  const resetForm = () => {
    setFormData({
      conta_id: "",
      categoria_id: "",
      valor: "",
      tipo: "despesa",
      data: format(new Date(), "yyyy-MM-dd"),
      forma_pagamento: "pix",
      recorrencia: "nenhuma",
      descricao: "",
      parcelas_total: "",
      conta_destino_id: "",
    });
    setEditingId(null);
    setCategorySearch("");
  };

  const getNextDate = (baseDate: Date, recorrencia: string, index: number): Date => {
    switch (recorrencia) {
      case 'semanal':
        return addWeeks(baseDate, index);
      case 'mensal':
        return addMonths(baseDate, index);
      case 'anual':
        return addYears(baseDate, index);
      default:
        return addMonths(baseDate, index);
    }
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyInput(e.target.value);
    setFormData({ ...formData, valor: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.conta_id || !formData.valor) {
      toast({ title: "Erro", description: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    const isTransfer = formData.forma_pagamento === 'transferencia';

    // Validate transfer requires destination account
    if (isTransfer && !formData.conta_destino_id) {
      toast({ title: "Erro", description: "Selecione a conta destino para transferência", variant: "destructive" });
      return;
    }

    // Validate destination is different from origin
    if (isTransfer && formData.conta_destino_id === formData.conta_id) {
      toast({ title: "Erro", description: "Conta destino deve ser diferente da conta origem", variant: "destructive" });
      return;
    }

    const parsedValor = parseCurrencyInput(formData.valor);
    const parsedParcelas = formData.parcelas_total ? parseInt(formData.parcelas_total) : null;

    // Handle transfer logic
    if (isTransfer && !editingId) {
      // Create two transactions: one expense (origin) and one income (destination)
      const transacaoSaida = {
        user_id: user?.id as string,
        conta_id: formData.conta_id,
        categoria_id: null,
        valor: parsedValor,
        tipo: 'despesa',
        data: formData.data,
        forma_pagamento: 'transferencia',
        recorrencia: 'nenhuma',
        descricao: formData.descricao || `Transferência para ${contas.find(c => c.id === formData.conta_destino_id)?.nome_conta}`,
        is_pago_executado: true,
        conta_destino_id: formData.conta_destino_id,
      };

      const transacaoEntrada = {
        user_id: user?.id as string,
        conta_id: formData.conta_destino_id,
        categoria_id: null,
        valor: parsedValor,
        tipo: 'receita',
        data: formData.data,
        forma_pagamento: 'transferencia',
        recorrencia: 'nenhuma',
        descricao: formData.descricao || `Transferência de ${contas.find(c => c.id === formData.conta_id)?.nome_conta}`,
        is_pago_executado: true,
        conta_destino_id: null,
      };

      const { error: errorSaida } = await supabase.from("transacoes").insert(transacaoSaida);
      if (errorSaida) {
        toast({ title: "Erro", description: "Erro ao criar transferência (saída)", variant: "destructive" });
        return;
      }

      const { error: errorEntrada } = await supabase.from("transacoes").insert(transacaoEntrada);
      if (errorEntrada) {
        toast({ title: "Erro", description: "Erro ao criar transferência (entrada)", variant: "destructive" });
        return;
      }

      toast({ title: "Sucesso", description: "Transferência realizada" });
      setDialogOpen(false);
      resetForm();
      invalidateQueries();
      return;
    }

    // Standard transaction or installment/recurrence logic
    // Check if it's fixed recurrence (unlimited) or has installments
    const isFixedRecurrence = formData.recorrencia === 'fixa';
    const needsInstallments = (formData.forma_pagamento === 'credito' || (formData.recorrencia !== 'nenhuma' && formData.recorrencia !== 'fixa'))
      && parsedParcelas && parsedParcelas > 1 && !editingId;

    if (needsInstallments) {
      // Create multiple installments/recurrences
      const baseDate = parseISO(formData.data);
      const transacoesToInsert = [];

      for (let i = 0; i < parsedParcelas; i++) {
        const nextDate = formData.forma_pagamento === 'credito'
          ? addMonths(baseDate, i)
          : getNextDate(baseDate, formData.recorrencia, i);

        transacoesToInsert.push({
          user_id: user?.id as string,
          conta_id: formData.conta_id,
          categoria_id: formData.categoria_id || null,
          valor: parsedValor,
          tipo: formData.tipo,
          data: format(nextDate, 'yyyy-MM-dd'),
          forma_pagamento: formData.forma_pagamento,
          recorrencia: formData.recorrencia,
          descricao: formData.descricao || null,
          parcelas_total: parsedParcelas,
          parcela_atual: i + 1,
          // Credit goes to invoice (always "paid"), non-credit: ALL start as unpaid for manual confirmation
          is_pago_executado: formData.forma_pagamento === 'credito',
        });
      }

      // Insert first transaction and get its ID
      const { data: firstTrans, error: firstError } = await supabase
        .from("transacoes")
        .insert(transacoesToInsert[0])
        .select()
        .single();

      if (firstError) {
        toast({ title: "Erro", description: "Erro ao criar transação", variant: "destructive" });
        return;
      }

      // Insert remaining transactions with transacao_origem_id
      if (transacoesToInsert.length > 1) {
        const remainingTransactions = transacoesToInsert.slice(1).map(t => ({
          ...t,
          transacao_origem_id: firstTrans.id,
        }));

        const { error: remainingError } = await supabase.from("transacoes").insert(remainingTransactions);
        if (remainingError) {
          toast({ title: "Erro", description: "Erro ao criar parcelas", variant: "destructive" });
          return;
        }
      }

      toast({ title: "Sucesso", description: `${parsedParcelas} parcelas criadas` });
    } else {
      // Single transaction
      const dataToSave = {
        user_id: user?.id as string,
        conta_id: formData.conta_id,
        categoria_id: formData.categoria_id || null,
        valor: parsedValor,
        tipo: formData.tipo,
        data: formData.data,
        forma_pagamento: formData.forma_pagamento,
        recorrencia: formData.recorrencia,
        descricao: formData.descricao || null,
        is_pago_executado: true,
        parcelas_total: parsedParcelas,
        parcela_atual: parsedParcelas ? 1 : null,
      };

      if (editingId) {
        const { error } = await supabase.from("transacoes").update(dataToSave).eq("id", editingId);
        if (error) {
          toast({ title: "Erro", description: "Erro ao atualizar transação", variant: "destructive" });
          return;
        }
        toast({ title: "Sucesso", description: "Transação atualizada" });
      } else {
        const { error } = await supabase.from("transacoes").insert(dataToSave);
        if (error) {
          toast({ title: "Erro", description: "Erro ao criar transação", variant: "destructive" });
          return;
        }
        toast({ title: "Sucesso", description: "Transação criada" });
      }
    }

    // Clear draft only after successful submission
    localStorage.removeItem(DRAFT_KEY);
    setDialogOpen(false);
    resetForm();
    invalidateQueries();
  };

  const handleEdit = (transacao: Transacao) => {
    setFormData({
      conta_id: transacao.conta_id,
      categoria_id: transacao.categoria_id || "",
      valor: transacao.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      tipo: transacao.tipo,
      data: transacao.data,
      forma_pagamento: transacao.forma_pagamento,
      recorrencia: transacao.recorrencia,
      descricao: transacao.descricao || "",
      parcelas_total: transacao.parcelas_total?.toString() || "",
      conta_destino_id: transacao.conta_destino_id || "",
    });
    setEditingId(transacao.id);
    setDialogOpen(true);
  };

  const handleDelete = (transacao: Transacao) => {
    setDeleteSeriesDialog({
      open: true,
      transacaoId: transacao.id,
      transacaoOrigemId: transacao.transacao_origem_id,
      transacaoData: transacao.data,
      descricao: transacao.descricao,
      parcelasTotal: transacao.parcelas_total,
    });
  };

  const handleConfirmPayment = (transacao: Transacao) => {
    setConfirmPaymentModal({
      open: true,
      transacaoId: transacao.id,
      valorPrevisto: Number(transacao.valor),
      descricao: transacao.descricao,
    });
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: "Erro", description: "Nome da categoria é obrigatório", variant: "destructive" });
      return;
    }

    const categoryTipo = formData.tipo;

    const { data: newCat, error } = await supabase.from("categorias").insert({
      user_id: user?.id,
      nome: newCategoryName.trim(),
      tipo: categoryTipo,
      cor: newCategoryCor,
    }).select().single();

    if (error) {
      toast({ title: "Erro", description: "Erro ao criar categoria", variant: "destructive" });
      return;
    }

    toast({ title: "Sucesso", description: "Categoria criada" });
    setFormData({ ...formData, categoria_id: newCat.id });
    setNewCategoryName("");
    setNewCategoryCor("#3B82F6");
    setCategoryDialogOpen(false);
    invalidateQueries();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = parseISO(dateString);
    return format(date, "dd/MM/yyyy", { locale: ptBR });
  };

  const getContaNome = (id: string) => contas.find(c => c.id === id)?.nome_conta || "-";
  const getCategoriaNome = (id: string | null) => id ? categorias.find(c => c.id === id)?.nome || "-" : "-";
  const getCategoriaCor = (id: string | null) => id ? categorias.find(c => c.id === id)?.cor || "#888" : "#888";

  // Filter categories by tipo and organize hierarchically
  const categoriasFiltered = categorias
    .filter(c => c.tipo === formData.tipo)
    .filter(c => c.nome.toLowerCase().includes(categorySearch.toLowerCase()));

  // Organize categories: main categories first, then subcategories grouped under them
  const mainCategorias = categoriasFiltered.filter(c => !c.categoria_pai_id);
  const getSubcategorias = (parentId: string) => categoriasFiltered.filter(c => c.categoria_pai_id === parentId);
  
  // Build hierarchical list for display
  const categoriaHierarchy = mainCategorias.flatMap(main => {
    const subs = getSubcategorias(main.id);
    return [
      { ...main, isMain: true, level: 0 },
      ...subs.map(sub => ({ ...sub, isMain: false, level: 1 }))
    ];
  });
  // Include orphan subcategories (parent might be filtered out by search)
  const orphanSubs = categoriasFiltered.filter(c => c.categoria_pai_id && !mainCategorias.some(m => m.id === c.categoria_pai_id));
  const finalCategoriaList = [...categoriaHierarchy, ...orphanSubs.map(s => ({ ...s, isMain: false, level: 1 }))];

  // Show installment fields when credit or has recurrence
  const showInstallmentFields = formData.forma_pagamento === 'credito' || formData.recorrencia !== 'nenhuma';
  const showTransferFields = formData.forma_pagamento === 'transferencia';

  // Apply advanced filters client-side
  const filteredTransacoes = useMemo(() => {
    let result = data?.transacoes || [];
    
    if (filters.tipo) {
      result = result.filter(t => t.tipo === filters.tipo);
    }
    if (filters.categoriaId) {
      result = result.filter(t => t.categoria_id === filters.categoriaId);
    }
    if (filters.contaId) {
      result = result.filter(t => t.conta_id === filters.contaId);
    }
    if (filters.formaPagamento) {
      result = result.filter(t => t.forma_pagamento === filters.formaPagamento);
    }
    if (filters.statusPagamento) {
      result = result.filter(t => {
        const isPago = t.is_pago_executado === true;
        return filters.statusPagamento === "pago" ? isPago : !isPago;
      });
    }
    
    return result;
  }, [data?.transacoes, filters.tipo, filters.categoriaId, filters.contaId, filters.formaPagamento, filters.statusPagamento]);

  // Pagination
  const totalPages = Math.ceil(filteredTransacoes.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTransacoes = filteredTransacoes.slice(startIndex, startIndex + ITEMS_PER_PAGE);

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
            <h1 className="text-2xl font-bold text-foreground">Transações</h1>
            <p className="text-muted-foreground">Gerencie suas receitas e despesas ({filteredTransacoes.length} lançamentos)</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                Nova Transação
              </Button>
            </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingId ? "Editar" : "Nova"} Transação</DialogTitle>
                  <DialogDescription>
                    Preencha os dados da transação abaixo.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select
                        value={formData.tipo}
                        onValueChange={(v) => setFormData({ ...formData, tipo: v, categoria_id: "" })}
                        disabled={showTransferFields}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="receita">Receita</SelectItem>
                          <SelectItem value="despesa">Despesa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Valor *</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          R$
                        </span>
                        <Input
                          value={formData.valor}
                          onChange={handleValorChange}
                          placeholder="0,00"
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Conta Origem *</Label>
                    <Select value={formData.conta_id} onValueChange={(v) => setFormData({ ...formData, conta_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {contas.map((conta) => (
                          <SelectItem key={conta.id} value={conta.id}>
                            {conta.nome_conta}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Transfer destination account */}
                  {showTransferFields && (
                    <div className="space-y-2">
                      <Label>Conta Destino *</Label>
                      <Select value={formData.conta_destino_id} onValueChange={(v) => setFormData({ ...formData, conta_destino_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a conta destino" />
                        </SelectTrigger>
                        <SelectContent>
                          {contas.filter(c => c.id !== formData.conta_id).map((conta) => (
                            <SelectItem key={conta.id} value={conta.id}>
                              {conta.nome_conta}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Category selection - hide for transfers */}
                  {!showTransferFields && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Categoria</Label>
                        <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
                          <DialogTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" className="h-6 text-xs">
                              <Plus className="h-3 w-3 mr-1" />
                              Nova
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-sm">
                            <DialogHeader>
                              <DialogTitle>Nova Categoria</DialogTitle>
                              <DialogDescription>
                                Criar categoria de {formData.tipo}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label>Nome *</Label>
                                <Input
                                  value={newCategoryName}
                                  onChange={(e) => setNewCategoryName(e.target.value)}
                                  placeholder="Ex: Alimentação, Salário..."
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Cor</Label>
                                <div className="flex flex-wrap gap-2">
                                  {cores.map((cor) => (
                                    <button
                                      key={cor}
                                      type="button"
                                      className={`w-8 h-8 rounded-full border-2 ${newCategoryCor === cor ? "border-foreground" : "border-transparent"}`}
                                      style={{ backgroundColor: cor }}
                                      onClick={() => setNewCategoryCor(cor)}
                                    />
                                  ))}
                                </div>
                              </div>
                              <Button type="button" onClick={handleCreateCategory} className="w-full gradient-primary text-primary-foreground">
                                Criar Categoria
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar categoria..."
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                          className="pl-9 mb-2"
                        />
                      </div>
                      <Select value={formData.categoria_id} onValueChange={(v) => setFormData({ ...formData, categoria_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {finalCategoriaList.length === 0 ? (
                            <div className="p-2 text-center text-muted-foreground text-sm">
                              Nenhuma categoria encontrada
                            </div>
                          ) : (
                            finalCategoriaList.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                <div className={`flex items-center gap-2 ${cat.level === 1 ? "pl-4" : ""}`}>
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.cor }} />
                                  <span className={cat.isMain ? "font-semibold" : ""}>
                                    {cat.level === 1 ? "↳ " : ""}{cat.nome}
                                  </span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={formData.data}
                        onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Forma Pagamento</Label>
                      <Select
                        value={formData.forma_pagamento}
                        onValueChange={(v) => {
                          const isTransferType = v === 'transferencia';
                          setFormData({
                            ...formData,
                            forma_pagamento: v,
                            tipo: isTransferType ? 'despesa' : formData.tipo,
                            categoria_id: isTransferType ? '' : formData.categoria_id,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {formasPagamento.map((fp) => (
                            <SelectItem key={fp.value} value={fp.value}>{fp.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {!showTransferFields && (
                    <div className="space-y-2">
                      <Label>Recorrência</Label>
                      <Select value={formData.recorrencia} onValueChange={(v) => setFormData({ ...formData, recorrencia: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {recorrencias.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Installment fields - hide for fixed recurrence */}
                  {showInstallmentFields && !showTransferFields && !editingId && formData.recorrencia !== 'fixa' && (
                    <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                      <Label>Número de Parcelas</Label>
                      <Input
                        type="number"
                        min="1"
                        max="360"
                        value={formData.parcelas_total}
                        onChange={(e) => setFormData({ ...formData, parcelas_total: e.target.value })}
                        placeholder="Ex: 12"
                      />
                      <p className="text-xs text-muted-foreground">
                        {formData.forma_pagamento === 'credito'
                          ? "Parcelas mensais do cartão de crédito"
                          : `Quantas vezes a ${formData.recorrencia === 'semanal' ? 'semana' : formData.recorrencia === 'mensal' ? 'mês' : 'ano'} será repetida`
                        }
                      </p>
                    </div>
                  )}
                  
                  {formData.recorrencia === 'fixa' && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        ♾️ Esta transação será criada como recorrência fixa (sem limite de parcelas). 
                        Novas ocorrências serão criadas automaticamente.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      placeholder="Descrição opcional"
                    />
                  </div>

                  <Button type="submit" className="w-full gradient-primary text-primary-foreground">
                    {editingId ? "Atualizar" : "Criar"} Transação
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
        </div>

        {/* Advanced Filters */}
        <AdvancedFilters
          filters={filters}
          onFiltersChange={(newFilters) => {
            setFilters(newFilters);
            setCurrentPage(1);
          }}
          categorias={categorias}
          contas={contas}
          showTipo
          showCategoria
          showConta
          showFormaPagamento
          showStatusPagamento
        />

        <Card className="shadow-card">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTransacoes.map((transacao, index) => (
                  <TableRow key={transacao.id}>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {startIndex + index + 1}
                    </TableCell>
                    <TableCell>{formatDate(transacao.data)}</TableCell>
                    <TableCell>
                      {transacao.forma_pagamento === 'transferencia' ? (
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/20">
                          <ArrowRightLeft className="h-3 w-3 mr-1" />
                          Transf.
                        </Badge>
                      ) : transacao.tipo === "receita" ? (
                        <Badge className="bg-success/10 text-success hover:bg-success/20">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Receita
                        </Badge>
                      ) : (
                        <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          Despesa
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">{transacao.descricao || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getCategoriaCor(transacao.categoria_id) }}
                        />
                        {getCategoriaNome(transacao.categoria_id)}
                      </div>
                    </TableCell>
                    <TableCell>{getContaNome(transacao.conta_id)}</TableCell>
                    <TableCell className="capitalize">
                      {formasPagamento.find(f => f.value === transacao.forma_pagamento)?.label}
                    </TableCell>
                    <TableCell>
                      {transacao.parcelas_total
                        ? `${transacao.parcela_atual}/${transacao.parcelas_total}`
                        : "-"
                      }
                    </TableCell>
                    <TableCell className={`text-right font-medium ${transacao.tipo === "receita" ? "text-success" : "text-destructive"}`}>
                      {transacao.tipo === "receita" ? "+" : "-"}{formatCurrency(Number(transacao.valor))}
                    </TableCell>
                    <TableCell>
                      {transacao.is_pago_executado === false ? (
                        <Badge variant="outline" className="text-warning border-warning">
                          Pendente
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-success border-success">
                          Pago
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {transacao.is_pago_executado === false && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-success"
                            onClick={() => handleConfirmPayment(transacao)}
                            title="Confirmar pagamento"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(transacao)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(transacao)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {transacoes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-16">
                      <div className="flex flex-col items-center gap-4">
                        <div className="p-4 rounded-full bg-muted">
                          <ArrowRightLeft className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma transação registada</h3>
                          <p className="text-muted-foreground mb-4">
                            Comece a registar suas receitas e despesas para ter controle financeiro.
                          </p>
                        </div>
                        <Button 
                          onClick={() => setDialogOpen(true)}
                          className="gradient-primary text-primary-foreground"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Criar Primeira Transação
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {startIndex + 1} - {Math.min(startIndex + ITEMS_PER_PAGE, transacoes.length)} de {transacoes.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let page;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      className="w-8"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Payment Modal */}
      <ConfirmPaymentModal
        open={confirmPaymentModal.open}
        onOpenChange={(open) => setConfirmPaymentModal((prev) => ({ ...prev, open }))}
        transacaoId={confirmPaymentModal.transacaoId}
        valorPrevisto={confirmPaymentModal.valorPrevisto}
        descricao={confirmPaymentModal.descricao}
      />

      {/* Delete Series Dialog */}
      <DeleteSeriesDialog
        open={deleteSeriesDialog.open}
        onOpenChange={(open) => setDeleteSeriesDialog((prev) => ({ ...prev, open }))}
        transacaoId={deleteSeriesDialog.transacaoId}
        transacaoOrigemId={deleteSeriesDialog.transacaoOrigemId}
        transacaoData={deleteSeriesDialog.transacaoData}
        descricao={deleteSeriesDialog.descricao}
        parcelasTotal={deleteSeriesDialog.parcelasTotal}
      />
    </AppLayout>
  );
};

export default Transacoes;
