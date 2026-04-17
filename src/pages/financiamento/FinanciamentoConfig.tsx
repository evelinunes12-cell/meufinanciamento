import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/calculations";
import { financiamentoSchema } from "@/lib/validations";

type TipoContrato = "financiamento" | "emprestimo";

interface Financiamento {
  id: string;
  nome: string;
  tipo: TipoContrato;
  icone: string | null;
  valor_financiado: number;
  valor_parcela: number;
  numero_parcelas: number;
  taxa_diaria: number;
  taxa_mensal: number;
  data_primeira_parcela: string;
  data_contratacao: string | null;
}

const initialForm = {
  nome: "",
  tipo: "financiamento" as TipoContrato,
  icone: "",
  valorFinanciado: "",
  valorParcela: "",
  numeroParcelas: "",
  taxaDiaria: "0.06",
  taxaMensal: "1.75",
  dataPrimeiraParcela: undefined as Date | undefined,
  dataContratacao: undefined as Date | undefined,
};

const FinanciamentoConfig = () => {
  const { user } = useAuth();
  const [financiamentos, setFinanciamentos] = useState<Financiamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (user) {
      fetchFinanciamentos();
    }
  }, [user]);

  const fetchFinanciamentos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("financiamento")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Erro", description: "Não foi possível carregar os contratos", variant: "destructive" });
    } else {
      setFinanciamentos((data || []) as Financiamento[]);
    }

    setLoading(false);
  };

  const selectedTitle = useMemo(
    () => (form.tipo === "emprestimo" ? "Valor do Empréstimo (Total recebido)" : "Valor Financiado"),
    [form.tipo]
  );

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (item: Financiamento) => {
    setForm({
      nome: item.nome,
      tipo: item.tipo,
      icone: item.icone || "",
      valorFinanciado: formatCurrencyInput(String(item.valor_financiado * 100)),
      valorParcela: formatCurrencyInput(String(item.valor_parcela * 100)),
      numeroParcelas: String(item.numero_parcelas),
      taxaDiaria: String(item.taxa_diaria * 100),
      taxaMensal: String(item.taxa_mensal * 100),
      dataPrimeiraParcela: item.data_primeira_parcela ? new Date(item.data_primeira_parcela) : undefined,
      dataContratacao: item.data_contratacao ? new Date(item.data_contratacao) : undefined,
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error: parcelasError } = await supabase.from("parcelas").delete().eq("financiamento_id", id);
    if (parcelasError) {
      toast({ title: "Erro", description: "Erro ao excluir parcelas do contrato", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("financiamento").delete().eq("id", id).eq("user_id", user?.id);
    if (error) {
      toast({ title: "Erro", description: "Erro ao excluir contrato", variant: "destructive" });
      return;
    }

    toast({ title: "Contrato removido", description: "O contrato foi removido com sucesso." });
    fetchFinanciamentos();
  };

  const generateParcelas = async (financiamentoId: string, numeroParcelas: number, valorParcelaNum: number, primeiraParcela: Date) => {
    const parcelas = [];

    for (let i = 1; i <= numeroParcelas; i++) {
      const dataVencimento = new Date(primeiraParcela);
      dataVencimento.setMonth(dataVencimento.getMonth() + (i - 1));

      parcelas.push({
        financiamento_id: financiamentoId,
        numero_parcela: i,
        data_vencimento: format(dataVencimento, "yyyy-MM-dd"),
        valor_parcela: valorParcelaNum,
      });
    }

    const { error } = await supabase.from("parcelas").insert(parcelas);
    if (error) throw error;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.dataPrimeiraParcela || !user) {
      toast({ title: "Erro", description: "Preencha a data da primeira parcela", variant: "destructive" });
      return;
    }

    setSaving(true);

    try {
      const validationData = {
        valor_financiado: parseCurrencyInput(form.valorFinanciado),
        valor_parcela: parseCurrencyInput(form.valorParcela),
        numero_parcelas: parseInt(form.numeroParcelas) || 0,
        taxa_diaria: parseFloat(form.taxaDiaria) / 100 || 0,
        taxa_mensal: parseFloat(form.taxaMensal) / 100 || 0,
        data_primeira_parcela: format(form.dataPrimeiraParcela, "yyyy-MM-dd"),
        data_contratacao: form.dataContratacao ? format(form.dataContratacao, "yyyy-MM-dd") : null,
      };

      const validationResult = financiamentoSchema.safeParse(validationData);
      if (!validationResult.success) {
        toast({ title: "Erro de validação", description: validationResult.error.errors[0].message, variant: "destructive" });
        setSaving(false);
        return;
      }

      const payload = {
        ...validationResult.data,
        nome: form.nome.trim() || "Contrato sem nome",
        tipo: form.tipo,
        icone: form.icone.trim() || null,
        user_id: user.id,
      };

      if (editingId) {
        // EDIÇÃO SEGURA: APENAS UPDATE na tabela financiamento.
        // NUNCA deletar/recriar parcelas aqui — isso apagaria histórico de pagamentos.
        // Para recálculo de parcelas, criar fluxo separado no futuro.
        const { error } = await supabase
          .from("financiamento")
          .update({
            nome: payload.nome,
            tipo: payload.tipo,
            icone: payload.icone,
            valor_financiado: payload.valor_financiado,
            valor_parcela: payload.valor_parcela,
            numero_parcelas: payload.numero_parcelas,
            taxa_diaria: payload.taxa_diaria,
            taxa_mensal: payload.taxa_mensal,
            data_primeira_parcela: payload.data_primeira_parcela,
            data_contratacao: payload.data_contratacao,
          })
          .eq("id", editingId)
          .eq("user_id", user.id);
        if (error) throw error;

        toast({
          title: "Contrato atualizado",
          description: "Dados do contrato salvos. Histórico de parcelas preservado.",
        });
      } else {
        // CRIAÇÃO: insere financiamento e gera parcelas iniciais.
        const { data: financiamento, error } = await supabase
          .from("financiamento")
          .insert([payload])
          .select("id")
          .single();

        if (error) throw error;

        await generateParcelas(
          financiamento.id,
          validationResult.data.numero_parcelas,
          validationResult.data.valor_parcela,
          form.dataPrimeiraParcela
        );

        toast({ title: "Contrato criado", description: "Novo contrato adicionado com sucesso." });
      }

      setShowForm(false);
      resetForm();
      fetchFinanciamentos();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message || "Erro ao salvar contrato", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

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
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestor de Contratos</h1>
            <p className="text-muted-foreground">Gerencie financiamentos e empréstimos por contrato.</p>
          </div>
          <Button onClick={startCreate} className="gradient-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Novo Contrato
          </Button>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Contratos cadastrados</CardTitle>
            <CardDescription>{financiamentos.length} contrato(s) registrado(s).</CardDescription>
          </CardHeader>
          <CardContent>
            {financiamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contrato cadastrado ainda.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {financiamentos.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-4 bg-muted/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{item.icone || "📄"} {item.nome}</p>
                        <p className="text-xs text-muted-foreground capitalize">{item.tipo}</p>
                        <p className="text-sm text-muted-foreground mt-1">{item.numero_parcelas}x de {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.valor_parcela)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="icon" variant="outline" onClick={() => startEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {showForm && (
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{editingId ? "Editar Contrato" : "Novo Contrato"}</CardTitle>
                <CardDescription>Preencha os dados para salvar o contrato.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); resetForm(); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                <div className="space-y-2">
                  <Label>Tipo do contrato</Label>
                  <RadioGroup value={form.tipo} onValueChange={(value: TipoContrato) => setForm((prev) => ({ ...prev, tipo: value }))} className="flex gap-6">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="financiamento" id="tipo-financiamento" />
                      <Label htmlFor="tipo-financiamento">Financiamento</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="emprestimo" id="tipo-emprestimo" />
                      <Label htmlFor="tipo-emprestimo">Empréstimo</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome</Label>
                    <Input id="nome" value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} placeholder="Ex: Carro" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="icone">Emoji / Ícone</Label>
                    <Input id="icone" value={form.icone} onChange={(e) => setForm((prev) => ({ ...prev, icone: e.target.value }))} placeholder="🚗" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="valorFinanciado">{selectedTitle} (R$)</Label>
                    <Input id="valorFinanciado" value={form.valorFinanciado} onChange={(e) => setForm((prev) => ({ ...prev, valorFinanciado: formatCurrencyInput(e.target.value) }))} placeholder="0,00" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valorParcela">Valor da Parcela (R$)</Label>
                    <Input id="valorParcela" value={form.valorParcela} onChange={(e) => setForm((prev) => ({ ...prev, valorParcela: formatCurrencyInput(e.target.value) }))} placeholder="0,00" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="numeroParcelas">Número de Parcelas</Label>
                    <Input id="numeroParcelas" type="number" min="1" max="600" value={form.numeroParcelas} onChange={(e) => setForm((prev) => ({ ...prev, numeroParcelas: e.target.value }))} required />
                  </div>

                  <div className="space-y-2">
                    <Label>Data da 1ª Parcela</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.dataPrimeiraParcela && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.dataPrimeiraParcela ? format(form.dataPrimeiraParcela, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "Selecione a data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={form.dataPrimeiraParcela} onSelect={(value) => setForm((prev) => ({ ...prev, dataPrimeiraParcela: value }))} locale={ptBR} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="taxaDiaria">Taxa Diária (%)</Label>
                    <Input id="taxaDiaria" type="number" step="0.0001" value={form.taxaDiaria} onChange={(e) => setForm((prev) => ({ ...prev, taxaDiaria: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxaMensal">Taxa Mensal (%)</Label>
                    <Input id="taxaMensal" type="number" step="0.01" value={form.taxaMensal} onChange={(e) => setForm((prev) => ({ ...prev, taxaMensal: e.target.value }))} required />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Data de Contratação</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.dataContratacao && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.dataContratacao ? format(form.dataContratacao, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "Selecione a data (opcional)"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={form.dataContratacao} onSelect={(value) => setForm((prev) => ({ ...prev, dataContratacao: value }))} locale={ptBR} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Salvar Contrato"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default FinanciamentoConfig;
