import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Wallet, CreditCard, PiggyBank, Landmark, Banknote } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { contaSchema } from "@/lib/validations";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/calculations";
interface Conta {
  id: string;
  nome_conta: string;
  tipo: string;
  saldo_inicial: number;
  cor: string;
  limite: number | null;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}

const tiposConta = [
  { value: "corrente", label: "Conta Corrente", icon: Landmark },
  { value: "poupanca", label: "Poupança", icon: PiggyBank },
  { value: "carteira", label: "Carteira", icon: Banknote },
  { value: "investimento", label: "Investimento", icon: Wallet },
  { value: "credito", label: "Cartão de Crédito", icon: CreditCard },
];

const cores = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", 
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"
];

const Contas = () => {
  const { user } = useAuth();
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nome_conta: "",
    tipo: "corrente",
    saldo_inicial: "",
    cor: "#3B82F6",
    limite: "",
    dia_fechamento: "",
    dia_vencimento: "",
  });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from("contas").select("*").order("nome_conta");
    if (data) setContas(data);
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      nome_conta: "",
      tipo: "corrente",
      saldo_inicial: "",
      cor: "#3B82F6",
      limite: "",
      dia_fechamento: "",
      dia_vencimento: "",
    });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nome_conta) {
      toast({ title: "Erro", description: "Nome da conta é obrigatório", variant: "destructive" });
      return;
    }

    // Validate input data with zod
    // Para cartões de crédito, saldo_inicial é sempre 0
    const isCredito = formData.tipo === "credito";
    const validationData = {
      nome_conta: formData.nome_conta.trim(),
      tipo: formData.tipo as 'corrente' | 'poupanca' | 'carteira' | 'investimento' | 'credito',
      saldo_inicial: isCredito ? 0 : (formData.saldo_inicial ? parseCurrencyInput(formData.saldo_inicial) : 0),
      cor: formData.cor,
      limite: isCredito && formData.limite ? parseCurrencyInput(formData.limite) : null,
      dia_fechamento: isCredito && formData.dia_fechamento ? parseInt(formData.dia_fechamento) : null,
      dia_vencimento: isCredito && formData.dia_vencimento ? parseInt(formData.dia_vencimento) : null,
    };

    const validationResult = contaSchema.safeParse(validationData);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      toast({ title: "Erro de validação", description: firstError.message, variant: "destructive" });
      return;
    }

    const validated = validationResult.data;
    const data = {
      user_id: user?.id as string,
      nome_conta: validated.nome_conta,
      tipo: validated.tipo,
      saldo_inicial: validated.saldo_inicial,
      cor: validated.cor,
      limite: validated.limite ?? null,
      dia_fechamento: validated.dia_fechamento ?? null,
      dia_vencimento: validated.dia_vencimento ?? null,
    };

    if (editingId) {
      const { error } = await supabase.from("contas").update(data).eq("id", editingId);
      if (error) {
        toast({ title: "Erro", description: "Erro ao atualizar conta", variant: "destructive" });
        return;
      }
      toast({ title: "Sucesso", description: "Conta atualizada" });
    } else {
      const { error } = await supabase.from("contas").insert(data);
      if (error) {
        toast({ title: "Erro", description: "Erro ao criar conta", variant: "destructive" });
        return;
      }
      toast({ title: "Sucesso", description: "Conta criada" });
    }

    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleEdit = (conta: Conta) => {
    setFormData({
      nome_conta: conta.nome_conta,
      tipo: conta.tipo,
      saldo_inicial: conta.saldo_inicial ? formatCurrencyInput((conta.saldo_inicial * 100).toString()) : "",
      cor: conta.cor,
      limite: conta.limite ? formatCurrencyInput((conta.limite * 100).toString()) : "",
      dia_fechamento: conta.dia_fechamento?.toString() || "",
      dia_vencimento: conta.dia_vencimento?.toString() || "",
    });
    setEditingId(conta.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("contas").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: "Erro ao excluir conta. Verifique se não há transações vinculadas.", variant: "destructive" });
      return;
    }
    toast({ title: "Sucesso", description: "Conta excluída" });
    fetchData();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const getIcon = (tipo: string) => {
    const tipoInfo = tiposConta.find(t => t.value === tipo);
    const Icon = tipoInfo?.icon || Wallet;
    return <Icon className="h-5 w-5" />;
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
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contas</h1>
            <p className="text-muted-foreground">Gerencie suas contas e cartões</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                Nova Conta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Nova"} Conta</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da Conta *</Label>
                  <Input
                    value={formData.nome_conta}
                    onChange={(e) => setFormData({ ...formData, nome_conta: e.target.value })}
                    placeholder="Ex: Nubank, Itaú..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposConta.map((tipo) => (
                        <SelectItem key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.tipo !== "credito" && (
                  <div className="space-y-2">
                    <Label>Saldo Inicial</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formData.saldo_inicial}
                        onChange={(e) => setFormData({ ...formData, saldo_inicial: formatCurrencyInput(e.target.value) })}
                        placeholder="0,00"
                        className="pl-10"
                      />
                    </div>
                  </div>
                )}

                {formData.tipo === "credito" && (
                  <>
                    <div className="space-y-2">
                      <Label>Limite do Cartão *</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={formData.limite}
                          onChange={(e) => setFormData({ ...formData, limite: formatCurrencyInput(e.target.value) })}
                          placeholder="0,00"
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Dia Fechamento *</Label>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          value={formData.dia_fechamento}
                          onChange={(e) => setFormData({ ...formData, dia_fechamento: e.target.value })}
                          placeholder="Ex: 15"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Dia Vencimento *</Label>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          value={formData.dia_vencimento}
                          onChange={(e) => setFormData({ ...formData, dia_vencimento: e.target.value })}
                          placeholder="Ex: 25"
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Cor</Label>
                  <div className="flex flex-wrap gap-2">
                    {cores.map((cor) => (
                      <button
                        key={cor}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 ${formData.cor === cor ? "border-foreground" : "border-transparent"}`}
                        style={{ backgroundColor: cor }}
                        onClick={() => setFormData({ ...formData, cor })}
                      />
                    ))}
                  </div>
                </div>

                <Button type="submit" className="w-full gradient-primary text-primary-foreground">
                  {editingId ? "Atualizar" : "Criar"} Conta
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contas.map((conta) => (
            <Card key={conta.id} className="shadow-card overflow-hidden">
              <div className="h-2" style={{ backgroundColor: conta.cor }} />
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: `${conta.cor}20` }}
                    >
                      <div style={{ color: conta.cor }}>
                        {getIcon(conta.tipo)}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{conta.nome_conta}</h3>
                      <p className="text-xs text-muted-foreground capitalize">
                        {tiposConta.find(t => t.value === conta.tipo)?.label}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(conta)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(conta.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {conta.tipo !== "credito" && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">Saldo Inicial</p>
                    <p className="text-xl font-bold text-foreground">{formatCurrency(Number(conta.saldo_inicial))}</p>
                  </div>
                )}
                {conta.tipo === "credito" && conta.limite && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">Limite Disponível</p>
                    <p className="text-xl font-bold text-foreground">{formatCurrency(Number(conta.limite))}</p>
                  </div>
                )}
                {conta.tipo === "credito" && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Fecha: dia {conta.dia_fechamento} | 
                      Vence: dia {conta.dia_vencimento}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {contas.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              Nenhuma conta cadastrada. Clique em "Nova Conta" para começar.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Contas;
