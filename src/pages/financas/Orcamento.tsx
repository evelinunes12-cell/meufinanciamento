import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, AlertTriangle, CheckCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

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
  cor: string;
}

interface Transacao {
  id: string;
  categoria_id: string | null;
  valor: number;
  tipo: string;
  data: string;
  forma_pagamento: string;
  is_pago_executado: boolean | null;
}

async function fetchOrcamentoData(userId: string | undefined, mesAtual: string) {
  if (!userId) return null;

  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);

  const [orcamentosRes, categoriasRes, transacoesRes] = await Promise.all([
    supabase.from("orcamentos").select("*").eq("mes_referencia", mesAtual),
    supabase.from("categorias").select("*").eq("tipo", "despesa"),
    supabase
      .from("transacoes")
      .select("*")
      .eq("tipo", "despesa")
      .gte("data", format(start, "yyyy-MM-dd"))
      .lte("data", format(end, "yyyy-MM-dd")),
  ]);

  return {
    orcamentos: (orcamentosRes.data || []) as Orcamento[],
    categorias: (categoriasRes.data || []) as Categoria[],
    transacoes: (transacoesRes.data || []) as Transacao[],
  };
}

const Orcamento = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    categoria_id: "",
    valor_limite: "",
  });

  const mesAtual = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["orcamentos", user?.id, mesAtual],
    queryFn: () => fetchOrcamentoData(user?.id, mesAtual),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const orcamentos = data?.orcamentos || [];
  const categorias = data?.categorias || [];
  const transacoes = data?.transacoes || [];

  const resetForm = () => {
    setFormData({ categoria_id: "", valor_limite: "" });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.categoria_id || !formData.valor_limite) {
      toast({ title: "Erro", description: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    const dataToSave = {
      user_id: user?.id,
      categoria_id: formData.categoria_id,
      valor_limite: parseFloat(formData.valor_limite),
      mes_referencia: mesAtual,
    };

    if (editingId) {
      const { error } = await supabase.from("orcamentos").update(dataToSave).eq("id", editingId);
      if (error) {
        toast({ title: "Erro", description: "Erro ao atualizar orçamento", variant: "destructive" });
        return;
      }
      toast({ title: "Sucesso", description: "Orçamento atualizado" });
    } else {
      const { error } = await supabase.from("orcamentos").insert(dataToSave);
      if (error) {
        if (error.code === "23505") {
          toast({ title: "Erro", description: "Já existe um orçamento para essa categoria neste mês", variant: "destructive" });
        } else {
          toast({ title: "Erro", description: "Erro ao criar orçamento", variant: "destructive" });
        }
        return;
      }
      toast({ title: "Sucesso", description: "Orçamento criado" });
    }

    setDialogOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
  };

  const handleEdit = (orcamento: Orcamento) => {
    setFormData({
      categoria_id: orcamento.categoria_id,
      valor_limite: orcamento.valor_limite.toString(),
    });
    setEditingId(orcamento.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("orcamentos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: "Erro ao excluir orçamento", variant: "destructive" });
      return;
    }
    toast({ title: "Sucesso", description: "Orçamento excluído" });
    queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const getCategoriaNome = (id: string) => categorias.find(c => c.id === id)?.nome || "-";
  const getCategoriaCor = (id: string) => categorias.find(c => c.id === id)?.cor || "#888";

  // Filter valid transactions: exclude transfers and non-executed payments
  const getGastosCategoria = (categoriaId: string) => {
    return transacoes
      .filter(t => 
        t.categoria_id === categoriaId && 
        t.forma_pagamento !== "transferencia" &&
        t.forma_pagamento !== "transferencia_entre_contas" &&
        t.is_pago_executado !== false
      )
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  const categoriasDisponiveis = categorias.filter(
    c => !orcamentos.some(o => o.categoria_id === c.id) || (editingId && orcamentos.find(o => o.id === editingId)?.categoria_id === c.id)
  );

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
            <h1 className="text-2xl font-bold text-foreground">Orçamento Mensal</h1>
            <p className="text-muted-foreground">
              {format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground" disabled={categoriasDisponiveis.length === 0}>
                <Plus className="h-4 w-4 mr-2" />
                Definir Limite
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Novo"} Limite</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={formData.categoria_id} onValueChange={(v) => setFormData({ ...formData, categoria_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriasDisponiveis.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Valor Limite</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.valor_limite}
                    onChange={(e) => setFormData({ ...formData, valor_limite: e.target.value })}
                    placeholder="0,00"
                  />
                </div>

                <Button type="submit" className="w-full gradient-primary text-primary-foreground">
                  {editingId ? "Atualizar" : "Criar"} Limite
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {orcamentos.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum orçamento definido</h3>
              <p className="text-muted-foreground text-center mb-4">
                Defina limites de gastos por categoria para controlar seu orçamento
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orcamentos.map((orcamento) => {
              const gastos = getGastosCategoria(orcamento.categoria_id);
              const limite = Number(orcamento.valor_limite);
              const percentual = (gastos / limite) * 100;
              const restante = limite - gastos;
              const status = percentual >= 100 ? "excedido" : percentual >= 80 ? "alerta" : "ok";

              return (
                <Card key={orcamento.id} className="shadow-card overflow-hidden">
                  <div 
                    className="h-2"
                    style={{ backgroundColor: getCategoriaCor(orcamento.categoria_id) }}
                  />
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getCategoriaCor(orcamento.categoria_id) }}
                        />
                        <h3 className="font-semibold text-foreground">
                          {getCategoriaNome(orcamento.categoria_id)}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1">
                        {status === "ok" && <CheckCircle className="h-4 w-4 text-success" />}
                        {status === "alerta" && <AlertTriangle className="h-4 w-4 text-warning" />}
                        {status === "excedido" && (
                          <Badge variant="destructive" className="text-xs">
                            Excedido
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Gasto</span>
                        <span className={`font-medium ${status === "excedido" ? "text-destructive" : "text-foreground"}`}>
                          {formatCurrency(gastos)}
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(percentual, 100)} 
                        className={`h-2 ${status === "excedido" ? "[&>div]:bg-destructive" : status === "alerta" ? "[&>div]:bg-warning" : ""}`}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{percentual.toFixed(1)}%</span>
                        <span>Limite: {formatCurrency(limite)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Restante</p>
                        <p className={`font-bold ${restante >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(restante)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(orcamento)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(orcamento.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Orcamento;
