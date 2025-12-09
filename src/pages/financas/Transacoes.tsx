import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";
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
  { value: "outro", label: "Outro" },
];

const recorrencias = [
  { value: "nenhuma", label: "Nenhuma" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
];

const Transacoes = () => {
  const { user } = useAuth();
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    conta_id: "",
    categoria_id: "",
    valor: "",
    tipo: "despesa",
    data: format(new Date(), "yyyy-MM-dd"),
    forma_pagamento: "pix",
    recorrencia: "nenhuma",
    descricao: "",
  });

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    const [transacoesRes, contasRes, categoriasRes] = await Promise.all([
      supabase.from("transacoes").select("*").order("data", { ascending: false }),
      supabase.from("contas").select("*"),
      supabase.from("categorias").select("*"),
    ]);

    if (transacoesRes.data) setTransacoes(transacoesRes.data);
    if (contasRes.data) setContas(contasRes.data);
    if (categoriasRes.data) setCategorias(categoriasRes.data);
    setLoading(false);
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
    });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.conta_id || !formData.valor) {
      toast({ title: "Erro", description: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    // Validate input data with zod
    const parsedValor = parseFloat(formData.valor);
    const validationData = {
      conta_id: formData.conta_id,
      categoria_id: formData.categoria_id || null,
      valor: isNaN(parsedValor) ? 0 : parsedValor,
      tipo: formData.tipo as 'receita' | 'despesa',
      data: formData.data,
      forma_pagamento: formData.forma_pagamento as 'pix' | 'debito' | 'credito' | 'dinheiro' | 'transferencia' | 'outro',
      recorrencia: formData.recorrencia as 'nenhuma' | 'semanal' | 'mensal' | 'anual',
      descricao: formData.descricao || null,
    };

    const validationResult = transacaoSchema.safeParse(validationData);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      toast({ title: "Erro de validação", description: firstError.message, variant: "destructive" });
      return;
    }

    const validated = validationResult.data;
    const data = {
      user_id: user?.id as string,
      conta_id: validated.conta_id,
      categoria_id: validated.categoria_id || null,
      valor: validated.valor,
      tipo: validated.tipo,
      data: validated.data,
      forma_pagamento: validated.forma_pagamento,
      recorrencia: validated.recorrencia,
      descricao: validated.descricao || null,
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const getContaNome = (id: string) => contas.find(c => c.id === id)?.nome_conta || "-";
  const getCategoriaNome = (id: string | null) => id ? categorias.find(c => c.id === id)?.nome || "-" : "-";
  const getCategoriaCor = (id: string | null) => id ? categorias.find(c => c.id === id)?.cor || "#888" : "#888";

  const categoriasFiltered = categorias.filter(c => c.tipo === formData.tipo);

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
            <p className="text-muted-foreground">Gerencie suas receitas e despesas</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                Nova Transação
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Nova"} Transação</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v, categoria_id: "" })}>
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
                  <Label>Conta *</Label>
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

                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={formData.categoria_id} onValueChange={(v) => setFormData({ ...formData, categoria_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriasFiltered.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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
                    <Select value={formData.forma_pagamento} onValueChange={(v) => setFormData({ ...formData, forma_pagamento: v })}>
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

        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transacoes.map((transacao) => (
                  <TableRow key={transacao.id}>
                    <TableCell>{format(new Date(transacao.data), "dd/MM/yyyy")}</TableCell>
                    <TableCell>
                      {transacao.tipo === "receita" ? (
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
                    <TableCell>{transacao.descricao || "-"}</TableCell>
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
                    <TableCell className={`text-right font-medium ${transacao.tipo === "receita" ? "text-success" : "text-destructive"}`}>
                      {transacao.tipo === "receita" ? "+" : "-"}{formatCurrency(Number(transacao.valor))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
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
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhuma transação cadastrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Transacoes;
