import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Edit, TrendingUp, TrendingDown, Search, ChevronLeft, ChevronRight, Check, ArrowRightLeft } from "lucide-react";
import { format, parseISO, addWeeks, addMonths, addYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { transacaoSchema } from "@/lib/validations";

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
}

const formasPagamento = [
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "transferencia_entre_contas", label: "Transf. Entre Contas" },
  { value: "outro", label: "Outro" },
];

const recorrencias = [
  { value: "nenhuma", label: "Nenhuma" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
];

const cores = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", 
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"
];

const ITEMS_PER_PAGE = 10;

const meses = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

const Transacoes = () => {
  const { user } = useAuth();
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Filters
  const currentDate = new Date();
  const [filterMes, setFilterMes] = useState(String(currentDate.getMonth() + 1).padStart(2, '0'));
  const [filterAno, setFilterAno] = useState(String(currentDate.getFullYear()));
  
  // Category inline creation
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCor, setNewCategoryCor] = useState("#3B82F6");

  const [formData, setFormData] = useState({
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
    is_parcelas_ilimitadas: false,
  });

  // Generate years for filter (last 5 years + current + next year)
  const anos = Array.from({ length: 7 }, (_, i) => String(currentDate.getFullYear() - 5 + i));

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, filterMes, filterAno]);

  const fetchData = async () => {
    setLoading(true);
    const startDate = `${filterAno}-${filterMes}-01`;
    const endDate = `${filterAno}-${filterMes}-31`;
    
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

    if (transacoesRes.data) setTransacoes(transacoesRes.data as Transacao[]);
    if (contasRes.data) setContas(contasRes.data);
    if (categoriasRes.data) setCategorias(categoriasRes.data);
    setLoading(false);
    setCurrentPage(1);
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
      is_parcelas_ilimitadas: false,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.conta_id || !formData.valor) {
      toast({ title: "Erro", description: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    const isTransfer = formData.forma_pagamento === 'transferencia' || formData.forma_pagamento === 'transferencia_entre_contas';
    
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
    
    // Validate categoria for transferencia_entre_contas
    if (formData.forma_pagamento === 'transferencia_entre_contas' && !formData.categoria_id) {
      toast({ title: "Erro", description: "Selecione uma categoria para transferência entre contas", variant: "destructive" });
      return;
    }

    const parsedValor = parseFloat(formData.valor);
    const parsedParcelas = formData.parcelas_total ? parseInt(formData.parcelas_total) : null;
    
    // Handle transfer logic (both types)
    if (isTransfer && !editingId) {
      const isTransferenciaEntreContas = formData.forma_pagamento === 'transferencia_entre_contas';
      
      // Create two transactions: one expense (origin) and one income (destination)
      const transacaoSaida = {
        user_id: user?.id as string,
        conta_id: formData.conta_id,
        categoria_id: isTransferenciaEntreContas ? formData.categoria_id : null,
        valor: parsedValor,
        tipo: 'despesa',
        data: formData.data,
        forma_pagamento: formData.forma_pagamento,
        recorrencia: 'nenhuma',
        descricao: formData.descricao || `Transferência para ${contas.find(c => c.id === formData.conta_destino_id)?.nome_conta}`,
        is_pago_executado: true,
        conta_destino_id: formData.conta_destino_id,
      };

      const transacaoEntrada = {
        user_id: user?.id as string,
        conta_id: formData.conta_destino_id,
        categoria_id: isTransferenciaEntreContas ? formData.categoria_id : null,
        valor: parsedValor,
        tipo: 'receita',
        data: formData.data,
        forma_pagamento: formData.forma_pagamento,
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
      fetchData();
      return;
    }

    // Standard transaction or installment/recurrence logic
    const needsInstallments = (formData.forma_pagamento === 'credito' || formData.recorrencia !== 'nenhuma') 
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
          is_pago_executado: formData.forma_pagamento === 'credito' ? true : i === 0, // Credit is always paid, recurrence first is paid
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
      const data = {
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
        const { error } = await supabase.from("transacoes").update(data).eq("id", editingId);
        if (error) {
          toast({ title: "Erro", description: "Erro ao atualizar transação", variant: "destructive" });
          return;
        }
        toast({ title: "Sucesso", description: "Transação atualizada" });
      } else {
        const { error } = await supabase.from("transacoes").insert(data);
        if (error) {
          toast({ title: "Erro", description: "Erro ao criar transação", variant: "destructive" });
          return;
        }
        toast({ title: "Sucesso", description: "Transação criada" });
      }
    }

    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleEdit = (transacao: Transacao) => {
    setFormData({
      conta_id: transacao.conta_id,
      categoria_id: transacao.categoria_id || "",
      valor: transacao.valor.toString(),
      tipo: transacao.tipo,
      data: transacao.data,
      forma_pagamento: transacao.forma_pagamento,
      recorrencia: transacao.recorrencia,
      descricao: transacao.descricao || "",
      parcelas_total: transacao.parcelas_total?.toString() || "",
      conta_destino_id: transacao.conta_destino_id || "",
      is_parcelas_ilimitadas: false,
    });
    setEditingId(transacao.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("transacoes").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: "Erro ao excluir transação", variant: "destructive" });
      return;
    }
    toast({ title: "Sucesso", description: "Transação excluída" });
    fetchData();
  };

  const handleConfirmPayment = async (id: string) => {
    const { error } = await supabase
      .from("transacoes")
      .update({ 
        is_pago_executado: true, 
        data_execucao_pagamento: format(new Date(), 'yyyy-MM-dd') 
      })
      .eq("id", id);

    if (error) {
      toast({ title: "Erro", description: "Erro ao confirmar pagamento", variant: "destructive" });
      return;
    }
    toast({ title: "Sucesso", description: "Pagamento confirmado" });
    fetchData();
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: "Erro", description: "Nome da categoria é obrigatório", variant: "destructive" });
      return;
    }

    const categoryTipo = formData.forma_pagamento === 'transferencia_entre_contas' 
      ? 'transferencia' 
      : formData.tipo;

    const { data, error } = await supabase.from("categorias").insert({
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
    setCategorias([...categorias, data]);
    setFormData({ ...formData, categoria_id: data.id });
    setNewCategoryName("");
    setNewCategoryCor("#3B82F6");
    setCategoryDialogOpen(false);
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

  // For transferencia_entre_contas, show transfer categories; otherwise show by tipo
  const categoriasFiltered = categorias
    .filter(c => {
      if (formData.forma_pagamento === 'transferencia_entre_contas') {
        return c.tipo === 'transferencia';
      }
      return c.tipo === formData.tipo;
    })
    .filter(c => c.nome.toLowerCase().includes(categorySearch.toLowerCase()));

  // Show installment fields when credit or has recurrence
  const showInstallmentFields = formData.forma_pagamento === 'credito' || formData.recorrencia !== 'nenhuma';
  const showTransferFields = formData.forma_pagamento === 'transferencia';
  const showTransferEntreContasFields = formData.forma_pagamento === 'transferencia_entre_contas';

  // Pagination
  const totalPages = Math.ceil(transacoes.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTransacoes = transacoes.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (loading) {
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
            <p className="text-muted-foreground">Gerencie suas receitas e despesas ({transacoes.length} lançamentos)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterMes} onValueChange={setFilterMes}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meses.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterAno} onValueChange={setFilterAno}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                        disabled={showTransferFields || showTransferEntreContasFields}
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
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.valor}
                        onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                        placeholder="0,00"
                      />
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
                  {(showTransferFields || showTransferEntreContasFields) && (
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

                  {/* Category selection - show for transferencia_entre_contas or regular transactions */}
                  {(showTransferEntreContasFields || !showTransferFields) && (
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
                                Criar categoria de {showTransferEntreContasFields ? 'transferência' : formData.tipo}
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
                          <SelectValue placeholder={showTransferEntreContasFields ? "Selecione uma categoria de transferência *" : "Selecione uma categoria"} />
                        </SelectTrigger>
                        <SelectContent>
                          {categoriasFiltered.length === 0 ? (
                            <div className="p-2 text-center text-muted-foreground text-sm">
                              {showTransferEntreContasFields 
                                ? "Nenhuma categoria de transferência. Crie uma na aba 'Categorias'."
                                : "Nenhuma categoria encontrada"
                              }
                            </div>
                          ) : (
                            categoriasFiltered.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.cor }} />
                                  {cat.nome}
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
                          const isTransferType = v === 'transferencia' || v === 'transferencia_entre_contas';
                          setFormData({ 
                            ...formData, 
                            forma_pagamento: v,
                            tipo: isTransferType ? 'despesa' : formData.tipo,
                            categoria_id: v === 'transferencia' ? '' : (v === 'transferencia_entre_contas' ? '' : formData.categoria_id),
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

                  {!showTransferFields && !showTransferEntreContasFields && (
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

                  {/* Installment fields */}
                  {showInstallmentFields && !showTransferFields && !showTransferEntreContasFields && !editingId && (
                    <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                      <Label>Número de Parcelas</Label>
                      <Input
                        type="number"
                        min="1"
                        max="360"
                        value={formData.parcelas_total}
                        onChange={(e) => setFormData({ ...formData, parcelas_total: e.target.value })}
                        placeholder="Ex: 12"
                        disabled={formData.is_parcelas_ilimitadas}
                      />
                      <p className="text-xs text-muted-foreground">
                        {formData.forma_pagamento === 'credito' 
                          ? "Parcelas mensais do cartão de crédito"
                          : `Quantas vezes a ${formData.recorrencia === 'semanal' ? 'semana' : formData.recorrencia === 'mensal' ? 'mês' : 'ano'} será repetida`
                        }
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
        </div>

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
                      ) : transacao.forma_pagamento === 'transferencia_entre_contas' ? (
                        <Badge className="bg-violet-500/10 text-violet-600 hover:bg-violet-500/20">
                          <ArrowRightLeft className="h-3 w-3 mr-1" />
                          T. Contas
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
                            onClick={() => handleConfirmPayment(transacao.id)}
                            title="Confirmar pagamento"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(transacao)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(transacao.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {transacoes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      Nenhuma transação neste período
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
    </AppLayout>
  );
};

export default Transacoes;
