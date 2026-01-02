import { useState, useEffect } from "react";
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
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/calculations";

interface Conta {
  id: string;
  nome_conta: string;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  cor: string;
}

interface QuickAddTransactionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QuickAddTransaction = ({ open, onOpenChange }: QuickAddTransactionProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [contas, setContas] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    valor: "",
    tipo: "despesa",
    conta_id: "",
    categoria_id: "",
    data: format(new Date(), "yyyy-MM-dd"),
  });

  useEffect(() => {
    if (open && user) {
      fetchData();
    }
  }, [open, user]);

  const fetchData = async () => {
    const [contasRes, categoriasRes] = await Promise.all([
      supabase.from("contas").select("id, nome_conta"),
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
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.conta_id || !formData.valor) {
      toast({
        title: "Erro",
        description: "Preencha os campos obrigatórios",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const parsedValor = parseCurrencyInput(formData.valor);

    const data = {
      user_id: user?.id as string,
      conta_id: formData.conta_id,
      categoria_id: formData.categoria_id || null,
      valor: parsedValor,
      tipo: formData.tipo,
      data: formData.data,
      forma_pagamento: "pix",
      recorrencia: "nenhuma",
      is_pago_executado: true,
    };

    const { error } = await supabase.from("transacoes").insert(data);

    if (error) {
      toast({
        title: "Erro",
        description: "Erro ao criar transação",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    toast({ title: "Sucesso", description: "Transação criada" });

    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
    queryClient.invalidateQueries({ queryKey: ["transacoes"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-financas"] });
    queryClient.invalidateQueries({ queryKey: ["orcamentos"] });

    setLoading(false);
    resetForm();
    onOpenChange(false);
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyInput(e.target.value);
    setFormData({ ...formData, valor: formatted });
  };

  const categoriasFiltered = categorias.filter((c) => c.tipo === formData.tipo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Lançamento Rápido</DialogTitle>
          <DialogDescription>
            Adicione uma transação rapidamente
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Valor *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={formData.tipo}
                onValueChange={(v) =>
                  setFormData({ ...formData, tipo: v, categoria_id: "" })
                }
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
              <Label>Data</Label>
              <Input
                type="date"
                value={formData.data}
                onChange={(e) =>
                  setFormData({ ...formData, data: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Conta *</Label>
            <Select
              value={formData.conta_id}
              onValueChange={(v) => setFormData({ ...formData, conta_id: v })}
            >
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
            <Select
              value={formData.categoria_id}
              onValueChange={(v) =>
                setFormData({ ...formData, categoria_id: v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categoriasFiltered.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cat.cor }}
                      />
                      {cat.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            className="w-full gradient-primary text-primary-foreground"
            disabled={loading}
          >
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickAddTransaction;
