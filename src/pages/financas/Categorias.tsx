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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Edit, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  icone: string;
  cor: string;
}

const cores = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", 
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"
];

const Categorias = () => {
  const { user } = useAuth();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("despesa");

  const [formData, setFormData] = useState({
    nome: "",
    tipo: "despesa",
    cor: "#3B82F6",
  });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from("categorias").select("*").order("nome");
    if (data) setCategorias(data);
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({ nome: "", tipo: activeTab, cor: "#3B82F6" });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nome) {
      toast({ title: "Erro", description: "Nome da categoria é obrigatório", variant: "destructive" });
      return;
    }

    const data = {
      user_id: user?.id,
      nome: formData.nome,
      tipo: formData.tipo,
      cor: formData.cor,
    };

    if (editingId) {
      const { error } = await supabase.from("categorias").update(data).eq("id", editingId);
      if (error) {
        toast({ title: "Erro", description: "Erro ao atualizar categoria", variant: "destructive" });
        return;
      }
      toast({ title: "Sucesso", description: "Categoria atualizada" });
    } else {
      const { error } = await supabase.from("categorias").insert(data);
      if (error) {
        toast({ title: "Erro", description: "Erro ao criar categoria", variant: "destructive" });
        return;
      }
      toast({ title: "Sucesso", description: "Categoria criada" });
    }

    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleEdit = (categoria: Categoria) => {
    setFormData({
      nome: categoria.nome,
      tipo: categoria.tipo,
      cor: categoria.cor,
    });
    setEditingId(categoria.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("categorias").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: "Erro ao excluir categoria. Verifique se não há transações vinculadas.", variant: "destructive" });
      return;
    }
    toast({ title: "Sucesso", description: "Categoria excluída" });
    fetchData();
  };

  const categoriasReceita = categorias.filter(c => c.tipo === "receita");
  const categoriasDespesa = categorias.filter(c => c.tipo === "despesa");

  const CategoriaCard = ({ categoria }: { categoria: Categoria }) => (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-3">
        <div 
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: categoria.cor }}
        />
        <span className="font-medium text-foreground">{categoria.nome}</span>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" onClick={() => handleEdit(categoria)}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(categoria.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

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
            <h1 className="text-2xl font-bold text-foreground">Categorias</h1>
            <p className="text-muted-foreground">Organize suas transações por categorias</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground" onClick={() => setFormData({ ...formData, tipo: activeTab })}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Categoria
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Nova"} Categoria</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: Alimentação, Salário..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
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
                  {editingId ? "Atualizar" : "Criar"} Categoria
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="despesa" className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Despesas ({categoriasDespesa.length})
            </TabsTrigger>
            <TabsTrigger value="receita" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Receitas ({categoriasReceita.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="despesa" className="mt-4">
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-2">
                {categoriasDespesa.map((cat) => (
                  <CategoriaCard key={cat.id} categoria={cat} />
                ))}
                {categoriasDespesa.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground">
                    Nenhuma categoria de despesa cadastrada
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="receita" className="mt-4">
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-2">
                {categoriasReceita.map((cat) => (
                  <CategoriaCard key={cat.id} categoria={cat} />
                ))}
                {categoriasReceita.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground">
                    Nenhuma categoria de receita cadastrada
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Categorias;
