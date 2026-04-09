import { useState, useEffect, useMemo } from "react";
import CategoryCombobox from "@/components/CategoryCombobox";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { format, parseISO, addWeeks, addMonths, addYears } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { formatCurrencyInput, parseCurrencyInput, calculateCardDueDate, calculateInstallmentDueDate } from "@/lib/calculations";
import ColorPicker from "@/components/ColorPicker";

interface Conta {
  id: string;
  nome_conta: string;
  tipo: string;
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

interface QuickAddTransactionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formasPagamento = [
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "rendimento", label: "Rendimento", onlyForTipo: "receita" as const },
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

const DRAFT_KEY = "quick-add-transaction-draft";

const QuickAddTransaction = ({ open, onOpenChange }: QuickAddTransactionProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [contas, setContas] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(false);

  // Category inline creation
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCor, setNewCategoryCor] = useState("#3B82F6");

  const getInitialFormData = () => {
    const defaultData = {
      valor: "",
      tipo: "despesa",
      conta_id: "",
      categoria_id: "",
      data: format(new Date(), "yyyy-MM-dd"),
      forma_pagamento: "pix",
      recorrencia: "nenhuma",
      parcelas_total: "",
      descricao: "",
      conta_destino_id: "",
      data_pagamento: "",
    };

    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        return { ...defaultData, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return defaultData;
  };

  const [formData, setFormData] = useState(getInitialFormData);

  // Save draft
  useEffect(() => {
    if (formData.valor || formData.conta_id || formData.categoria_id || formData.descricao) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
    }
  }, [formData]);

  useEffect(() => {
    if (open && user) {
      fetchData();
    }
  }, [open, user]);

  // Auto-calculate credit card due date
  useEffect(() => {
    if (formData.forma_pagamento !== 'credito' || !formData.conta_id || !formData.data) return;
    const selectedConta = contas.find(c => c.id === formData.conta_id);
    if (!selectedConta || selectedConta.tipo !== 'credito') return;
    const closingDay = selectedConta.dia_fechamento;
    const dueDay = selectedConta.dia_vencimento;
    if (!closingDay || !dueDay) return;

    const purchaseDate = parseISO(formData.data);
    const calculatedDueDate = calculateCardDueDate(purchaseDate, closingDay, dueDay);
    const formattedDueDate = format(calculatedDueDate, 'yyyy-MM-dd');

    if (formData.data_pagamento !== formattedDueDate) {
      setFormData(prev => ({ ...prev, data_pagamento: formattedDueDate }));
    }
  }, [formData.conta_id, formData.data, formData.forma_pagamento, contas]);

  const fetchData = async () => {
    const [contasRes, categoriasRes] = await Promise.all([
      supabase.from("contas").select("*"),
      supabase.from("categorias").select("*").order("nome"),
    ]);
    if (contasRes.data) setContas(contasRes.data);
    if (categoriasRes.data) setCategorias(categoriasRes.data);
  };

  const resetForm = () => {
    setFormData({
      valor: "",
      tipo: "despesa",
      conta_id: "",
      categoria_id: "",
      data: format(new Date(), "yyyy-MM-dd"),
      forma_pagamento: "pix",
      recorrencia: "nenhuma",
      parcelas_total: "",
      descricao: "",
      conta_destino_id: "",
      data_pagamento: "",
    });
    
  };

  const getNextDate = (baseDate: Date, recorrencia: string, index: number): Date => {
    switch (recorrencia) {
      case 'semanal': return addWeeks(baseDate, index);
      case 'mensal': return addMonths(baseDate, index);
      case 'anual': return addYears(baseDate, index);
      default: return addMonths(baseDate, index);
    }
  };

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
    queryClient.invalidateQueries({ queryKey: ["saldo"] });
    queryClient.invalidateQueries({ queryKey: ["contas"] });
    queryClient.invalidateQueries({ queryKey: ["transacoes"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-financas"] });
    queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
  };

  useEffect(() => {
    if (formData.tipo !== "receita" && formData.forma_pagamento === "rendimento") {
      setFormData((prev) => ({ ...prev, forma_pagamento: "pix" }));
    }
  }, [formData.tipo, formData.forma_pagamento]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.conta_id || !formData.valor) {
      toast({ title: "Erro", description: "Preencha os campos obrigatórios", variant: "destructive" });
      setLoading(false);
      return;
    }

    const isTransfer = formData.forma_pagamento === 'transferencia';

    // Validate transfer
    if (isTransfer && !formData.conta_destino_id) {
      toast({ title: "Erro", description: "Selecione a conta destino para transferência", variant: "destructive" });
      setLoading(false);
      return;
    }
    if (isTransfer && formData.conta_destino_id === formData.conta_id) {
      toast({ title: "Erro", description: "Conta destino deve ser diferente da conta origem", variant: "destructive" });
      setLoading(false);
      return;
    }

    const parsedValor = parseCurrencyInput(formData.valor);
    const parsedParcelas = formData.parcelas_total ? parseInt(formData.parcelas_total) : null;

    // Handle transfer
    if (isTransfer) {
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

      const { error: e1 } = await supabase.from("transacoes").insert(transacaoSaida);
      if (e1) { toast({ title: "Erro", description: "Erro ao criar transferência", variant: "destructive" }); setLoading(false); return; }
      const { error: e2 } = await supabase.from("transacoes").insert(transacaoEntrada);
      if (e2) { toast({ title: "Erro", description: "Erro ao criar transferência", variant: "destructive" }); setLoading(false); return; }

      toast({ title: "Sucesso", description: "Transferência realizada" });
      localStorage.removeItem(DRAFT_KEY);
      setLoading(false);
      resetForm();
      onOpenChange(false);
      invalidateQueries();
      return;
    }

    // Standard transaction logic
    const isCreditCard = formData.forma_pagamento === 'credito';
    const needsInstallments = (isCreditCard || (formData.recorrencia !== 'nenhuma' && formData.recorrencia !== 'fixa'))
      && parsedParcelas && parsedParcelas > 1;

    const selectedConta = contas.find(c => c.id === formData.conta_id);
    const isCardAccount = selectedConta?.tipo === 'credito';
    const closingDay = selectedConta?.dia_fechamento || 1;
    const dueDay = selectedConta?.dia_vencimento || 10;

    if (needsInstallments) {
      const baseDate = parseISO(formData.data);
      const transacoesToInsert = [];
      const firstInstallmentDueDate = (isCreditCard && isCardAccount)
        ? calculateCardDueDate(baseDate, closingDay, dueDay)
        : null;

      for (let i = 0; i < parsedParcelas; i++) {
        const installmentDate = addMonths(baseDate, i);
        let transactionDate: string;
        let paymentDate: string | null = null;

        if (isCreditCard && isCardAccount && firstInstallmentDueDate) {
          transactionDate = format(baseDate, "yyyy-MM-dd");
          paymentDate = format(calculateInstallmentDueDate(firstInstallmentDueDate, i, dueDay), "yyyy-MM-dd");
        } else {
          const nextDate = getNextDate(baseDate, formData.recorrencia, i);
          transactionDate = format(nextDate, 'yyyy-MM-dd');
        }

        transacoesToInsert.push({
          user_id: user?.id as string,
          conta_id: formData.conta_id,
          categoria_id: formData.categoria_id || null,
          valor: parsedValor,
          tipo: formData.tipo,
          data: transactionDate,
          data_pagamento: paymentDate,
          forma_pagamento: formData.forma_pagamento,
          recorrencia: formData.recorrencia,
          descricao: formData.descricao || null,
          parcelas_total: parsedParcelas,
          parcela_atual: i + 1,
          is_pago_executado: false,
        });
      }

      const { data: firstTrans, error: firstError } = await supabase
        .from("transacoes").insert(transacoesToInsert[0]).select().single();

      if (firstError) {
        toast({ title: "Erro", description: "Erro ao criar transação", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (transacoesToInsert.length > 1) {
        const remaining = transacoesToInsert.slice(1).map(t => ({ ...t, transacao_origem_id: firstTrans.id }));
        const { error } = await supabase.from("transacoes").insert(remaining);
        if (error) {
          toast({ title: "Erro", description: "Erro ao criar parcelas", variant: "destructive" });
          setLoading(false);
          return;
        }
      }

      toast({ title: "Sucesso", description: `${parsedParcelas} parcelas criadas` });
    } else {
      // Single transaction
      let paymentDate: string | null = null;
      let isPaid = true;

      const transactionDate = parseISO(formData.data);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isFutureDate = transactionDate > today;

      if (isCreditCard && isCardAccount) {
        const dueDateCalc = calculateCardDueDate(transactionDate, closingDay, dueDay);
        paymentDate = format(dueDateCalc, 'yyyy-MM-dd');
        isPaid = false;
      } else if (isFutureDate) {
        isPaid = false;
      }

      const dataToSave = {
        user_id: user?.id as string,
        conta_id: formData.conta_id,
        categoria_id: formData.categoria_id || null,
        valor: parsedValor,
        tipo: formData.tipo,
        data: formData.data,
        data_pagamento: paymentDate,
        forma_pagamento: formData.forma_pagamento,
        recorrencia: formData.recorrencia,
        descricao: formData.descricao || null,
        is_pago_executado: isPaid,
        parcelas_total: parsedParcelas,
        parcela_atual: parsedParcelas ? 1 : null,
      };

      const { error } = await supabase.from("transacoes").insert(dataToSave);
      if (error) {
        toast({ title: "Erro", description: "Erro ao criar transação", variant: "destructive" });
        setLoading(false);
        return;
      }
      toast({ title: "Sucesso", description: "Transação criada" });
    }

    localStorage.removeItem(DRAFT_KEY);
    setLoading(false);
    resetForm();
    onOpenChange(false);
    invalidateQueries();
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyInput(e.target.value);
    setFormData({ ...formData, valor: formatted });
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: "Erro", description: "Nome da categoria é obrigatório", variant: "destructive" });
      return;
    }
    const { data: newCat, error } = await supabase.from("categorias").insert({
      user_id: user?.id,
      nome: newCategoryName.trim(),
      tipo: formData.tipo,
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
    fetchData();
  };


  const showInstallmentFields = formData.forma_pagamento === 'credito' || formData.recorrencia !== 'nenhuma';
  const showTransferFields = formData.forma_pagamento === 'transferencia';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lançamento Rápido</DialogTitle>
          <DialogDescription>
            Adicione uma transação rapidamente
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
                  autoFocus
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

          {/* Transfer destination */}
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

          {/* Category - hide for transfers */}
          {!showTransferFields && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Categoria</Label>
                <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setCategoryDialogOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Nova
                  </Button>
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
                        <ColorPicker value={newCategoryCor} onChange={setNewCategoryCor} />
                      </div>
                      <Button type="button" onClick={handleCreateCategory} className="w-full gradient-primary text-primary-foreground">
                        Criar Categoria
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <CategoryCombobox
                categorias={categorias}
                tipo={formData.tipo}
                value={formData.categoria_id}
                onValueChange={(v) => setFormData({ ...formData, categoria_id: v })}
              />
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
                  {formasPagamento
                    .filter((fp) => {
                      const isCardAccount = contas.find(c => c.id === formData.conta_id)?.tipo === 'credito';
                      if (isCardAccount) return fp.value === 'credito';
                      if ("onlyForTipo" in fp) return fp.onlyForTipo === formData.tipo;
                      return true;
                    })
                    .map((fp) => (
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

          {/* Installment fields */}
          {showInstallmentFields && !showTransferFields && formData.recorrencia !== 'fixa' && (
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

          <Button
            type="submit"
            className="w-full gradient-primary text-primary-foreground"
            disabled={loading}
          >
            {loading ? "Salvando..." : "Criar Transação"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickAddTransaction;
