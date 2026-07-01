import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton, { TabContentSkeleton } from "@/components/PageLoadingSkeleton";
import { useTabTransition } from "@/hooks/useTabTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Edit, TrendingUp, TrendingDown, Search, ChevronLeft, ChevronRight, ChevronDown, FolderTree, FolderPlus, Sparkles, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ColorPicker from "@/components/ColorPicker";
import { useToast } from "@/hooks/use-toast";
import { categoriaSchema } from "@/lib/validations";
import { Checkbox } from "@/components/ui/checkbox";

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  icone: string;
  cor: string;
  categoria_pai_id: string | null;
  is_default: boolean;
}

interface DefaultCategoryGroup {
  nome: string;
  tipo: "receita" | "despesa";
  cor: string;
  subcategorias: string[];
}

const DEFAULT_CATEGORIES: DefaultCategoryGroup[] = [
  { nome: "Salário", tipo: "receita", cor: "#22c55e", subcategorias: ["Salário Fixo", "Comissões", "Premiações", "Vale Alimentação", "Bonus"] },
  { nome: "Investimentos e Rendimentos", tipo: "receita", cor: "#16a34a", subcategorias: ["Rendimento de Aplicações", "Rendimento de Investimentos", "Rendimentos de Poupança", "Rendimento de Cofrinhos", "Rendimentos de Conta"] },
  { nome: "Reembolso e Cashback", tipo: "receita", cor: "#15803d", subcategorias: ["Reembolso de Plano de Saúde", "Reembolso de Plano Odontológico", "Reembolso de Compras Gerais", "Cashback de Compras"] },
  { nome: "Transferências", tipo: "receita", cor: "#166534", subcategorias: ["Transferências de Terceiros", "Acerto de Contas Com Terceiros"] },
  { nome: "Alugueis", tipo: "receita", cor: "#4ade80", subcategorias: ["Alugueis de Imóveis", "Alugueis de Carros", "Alugueis de Materiais"] },
  { nome: "Outras Receitas", tipo: "receita", cor: "#86efac", subcategorias: ["Receitas Extras", "Doações", "Presentes"] },
  { nome: "Moradia", tipo: "despesa", cor: "#3b82f6", subcategorias: ["Aluguel", "Condomínio", "Energia", "Água", "Internet", "Outras Despesas de Moradia", "Móveis", "Reformas"] },
  { nome: "Alimentação", tipo: "despesa", cor: "#f97316", subcategorias: ["Supermercado", "Restaurantes", "Padarias", "Lanchonetes", "Delivery", "Outras Despesas de Alimentação", "Ifood"] },
  { nome: "Transporte", tipo: "despesa", cor: "#8b5cf6", subcategorias: ["Transporte Público", "Combustível", "Manutenção", "Estacionamento", "Uber", "99", "Outras Despesas de Transporte"] },
  { nome: "Saúde", tipo: "despesa", cor: "#ec4899", subcategorias: ["Farmácia", "Plano de Saúde", "Plano Odontológico", "Consultas", "Exames", "Psicólogo", "Outras Despesas de Saúde"] },
  { nome: "Lazer", tipo: "despesa", cor: "#eab308", subcategorias: ["Netflix", "Spotify", "Assinaturas", "Bares", "Viagens", "Cinema", "Shows", "Teatro", "Parques", "Passeios", "Outras Despesas de Lazer", "Jogos Online"] },
  { nome: "Despesas Pessoais", tipo: "despesa", cor: "#06b6d4", subcategorias: ["Roupas", "Sapatos", "Produtos de Beleza", "Salão de Beleza", "Barbearia", "Outras Despesas Pessoais"] },
  { nome: "Família", tipo: "despesa", cor: "#14b8a6", subcategorias: ["Presentes", "Ajuda de Custos", "Transferências Para Familiares", "Outros Gastos Com Família", "Brinquedos", "Escola"] },
  { nome: "Pets", tipo: "despesa", cor: "#f43f5e", subcategorias: ["Ração", "Exames", "Consultas", "Remédios", "Brinquedos", "Outros Gastos Com Pets"] },
];

const ITEMS_PER_PAGE = 10;

async function fetchCategoriasData(userId: string | undefined) {
  if (!userId) return [];

  const { data } = await supabase
    .from("categorias")
    .select("*")
    .in("tipo", ["receita", "despesa"])
    .order("nome");

  return (data || []) as Categoria[];
}

const Categorias = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { tab: activeTab, setTab: setActiveTab, isTransitioning: isTabSwitching } = useTabTransition<"despesa" | "receita">("despesa");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [starterPackOpen, setStarterPackOpen] = useState(false);
  const [starterPackLoading, setStarterPackLoading] = useState(false);
  const [selectedStarterGroups, setSelectedStarterGroups] = useState<Set<string>>(new Set(DEFAULT_CATEGORIES.map((group) => group.nome)));

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [formData, setFormData] = useState({
    nome: "",
    tipo: "despesa",
    cor: "#3B82F6",
    categoria_pai_id: "",
  });

  const { data: categorias = [], isLoading } = useQuery({
    queryKey: ["categorias", user?.id],
    queryFn: () => fetchCategoriasData(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Reset page when tab or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["categorias"] });
    queryClient.invalidateQueries({ queryKey: ["transacoes"] });
  };

  const resetForm = () => {
    setFormData({ nome: "", tipo: activeTab, cor: "#3B82F6", categoria_pai_id: "" });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate using zod schema
    const validationData = {
      nome: formData.nome.trim(),
      tipo: formData.tipo as 'receita' | 'despesa',
      cor: formData.cor,
      categoria_pai_id: formData.categoria_pai_id || null,
    };

    const result = categoriaSchema.safeParse(validationData);
    if (!result.success) {
      const firstError = result.error.errors[0];
      toast({ title: "Erro de validação", description: firstError.message, variant: "destructive" });
      return;
    }

    const validated = result.data;
    const data = {
      user_id: user?.id,
      nome: validated.nome,
      tipo: validated.tipo,
      cor: validated.cor,
      categoria_pai_id: validated.categoria_pai_id || null,
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

    const parentIdCriado = !editingId ? validated.categoria_pai_id : null;
    setDialogOpen(false);
    resetForm();
    await queryClient.invalidateQueries({ queryKey: ["categorias"] });
    await queryClient.refetchQueries({ queryKey: ["categorias", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["transacoes"] });
    if (parentIdCriado) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(parentIdCriado);
        return next;
      });
    }
  };

  const handleEdit = (categoria: Categoria) => {
    setFormData({
      nome: categoria.nome,
      tipo: categoria.tipo,
      cor: categoria.cor,
      categoria_pai_id: categoria.categoria_pai_id || "",
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
    invalidateQueries();
  };

  const handleAddSubcategoria = (parent: Categoria) => {
    setEditingId(null);
    setFormData({
      nome: "",
      tipo: parent.tipo,
      cor: parent.cor,
      categoria_pai_id: parent.id,
    });
    setDialogOpen(true);
  };

  const toggleStarterGroup = (groupName: string) => {
    setSelectedStarterGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

  const handleCreateStarterPack = async () => {
    if (!user?.id) return;

    const selectedGroups = DEFAULT_CATEGORIES.filter((group) => selectedStarterGroups.has(group.nome));
    if (selectedGroups.length === 0) {
      toast({ title: "Selecione categorias", description: "Marque pelo menos um grupo para criar." });
      return;
    }

    setStarterPackLoading(true);
    try {
      for (const group of selectedGroups) {
        const { data: existingParent, error: parentLookupError } = await supabase
          .from("categorias")
          .select("*")
          .eq("nome", group.nome)
          .eq("tipo", group.tipo)
          .is("categoria_pai_id", null)
          .maybeSingle();

        if (parentLookupError) throw parentLookupError;

        let parent = existingParent as Categoria | null;

        if (!parent) {
          const { data, error } = await supabase
            .from("categorias")
            .insert({ user_id: user.id, nome: group.nome, tipo: group.tipo, cor: group.cor, categoria_pai_id: null })
            .select("*")
            .single();

          if (error) throw error;
          parent = data as Categoria;
        }

        const { data: existingChildren, error: childrenError } = await supabase
          .from("categorias")
          .select("nome")
          .eq("categoria_pai_id", parent.id);

        if (childrenError) throw childrenError;

        const existingChildNames = new Set((existingChildren || []).map((child) => child.nome));
        const childrenToCreate = group.subcategorias
          .filter((nome) => !existingChildNames.has(nome))
          .map((nome) => ({ user_id: user.id, nome, tipo: group.tipo, cor: group.cor, categoria_pai_id: parent.id }));

        if (childrenToCreate.length > 0) {
          const { error } = await supabase.from("categorias").insert(childrenToCreate);
          if (error) throw error;
        }
      }

      toast({ title: "Categorias padrões criadas", description: "Seu starter pack financeiro foi aplicado com sucesso." });
      setStarterPackOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["categorias"] });
      await queryClient.refetchQueries({ queryKey: ["categorias", user.id] });
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
    } catch (error) {
      console.error("Erro ao criar categorias padrões", error);
      toast({ title: "Erro", description: "Não foi possível criar as categorias padrões.", variant: "destructive" });
    } finally {
      setStarterPackLoading(false);
    }
  };

  // Separate main categories (no parent) and subcategories
  const categoriasReceita = categorias
    .filter(c => c.tipo === "receita")
    .filter(c => c.nome.toLowerCase().includes(searchTerm.toLowerCase()));
  
  const categoriasDespesa = categorias
    .filter(c => c.tipo === "despesa")
    .filter(c => c.nome.toLowerCase().includes(searchTerm.toLowerCase()));

  // Get only main categories (no parent) for the current tab
  const currentAllCategorias = activeTab === "receita" ? categoriasReceita : categoriasDespesa;
  const mainCategorias = currentAllCategorias.filter(c => !c.categoria_pai_id);
  const getSubcategorias = (parentId: string) => currentAllCategorias.filter(c => c.categoria_pai_id === parentId);

  // Available parent categories for selection (exclude current editing category and its subcategories)
  const availableParentCategorias = categorias
    .filter(c => c.tipo === formData.tipo && !c.categoria_pai_id && c.id !== editingId);

  // Paginate parents only; their children are rendered nested
  const totalPages = Math.ceil(mainCategorias.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedParents = mainCategorias.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const searchActive = searchTerm.trim().length > 0;

  const ParentCard = ({ categoria, index }: { categoria: Categoria; index: number }) => {
    const subs = getSubcategorias(categoria.id);
    const isExpanded = expandedIds.has(categoria.id) || searchActive;
    const hasSubs = subs.length > 0;

    return (
      <div className="rounded-xl border bg-card shadow-sm transition-all hover:shadow-md overflow-hidden">
        <div
          className={`flex items-center justify-between gap-2 p-4 ${hasSubs ? "cursor-pointer hover:bg-muted/40" : ""}`}
          onClick={() => hasSubs && toggleExpand(categoria.id)}
          role={hasSubs ? "button" : undefined}
          aria-expanded={hasSubs ? isExpanded : undefined}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="text-muted-foreground font-mono text-xs w-5 shrink-0">{startIndex + index + 1}</span>
            <div
              className="w-4 h-4 rounded-full shrink-0"
              style={{ backgroundColor: categoria.cor, boxShadow: `0 0 0 3px ${categoria.cor}25` }}
            />
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-foreground truncate">{categoria.nome}</span>
              {hasSubs && (
                <span className="text-xs text-muted-foreground">
                  {subs.length} subcategoria{subs.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {hasSubs && (
              <Badge variant="secondary" className="hidden sm:inline-flex font-mono text-xs">
                {subs.length}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleAddSubcategoria(categoria)}
              aria-label="Adicionar subcategoria"
              title="Adicionar subcategoria"
            >
              <FolderPlus className="h-4 w-4 text-primary" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleEdit(categoria)} aria-label="Editar">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(categoria.id)} aria-label="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
            {hasSubs && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleExpand(categoria.id)}
                aria-label={isExpanded ? "Recolher" : "Expandir"}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </Button>
            )}
          </div>
        </div>

        {hasSubs && isExpanded && (
          <div className="border-t bg-muted/30 px-4 py-3 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
            {subs.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground text-xs">↳</span>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sub.cor }} />
                  <span className="text-sm text-foreground truncate">{sub.nome}</span>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(sub)} aria-label="Editar">
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(sub.id)} aria-label="Excluir">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderList = (parents: Categoria[], emptyMessage: string) => (
    <div className="flex flex-col gap-3 w-full">
      {parents.map((cat, idx) => (
        <ParentCard key={cat.id} categoria={cat} index={idx} />
      ))}
      {parents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <FolderTree className="h-10 w-10 mb-3 opacity-50" />
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <AppLayout>
        <PageLoadingSkeleton type="cards" title="Categorias" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Categorias</h1>
            <p className="text-muted-foreground">Organize suas transações por categorias ({categorias.length} categorias)</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Dialog open={starterPackOpen} onOpenChange={setStarterPackOpen}>
              <DialogTrigger asChild>
                <Button
                  variant={categorias.length === 0 ? "default" : "outline"}
                  className={categorias.length === 0 ? "gradient-primary text-primary-foreground shadow-lg shadow-primary/20" : "border-primary/30 text-primary hover:bg-primary/10"}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Gerar Categorias Padrões
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Starter Pack de Categorias</DialogTitle>
                  <DialogDescription>
                    Selecione os grupos que deseja criar. Categorias e subcategorias já existentes não serão duplicadas.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-5 md:grid-cols-2">
                  {(["receita", "despesa"] as const).map((tipo) => (
                    <div key={tipo} className="space-y-3">
                      <div className="flex items-center gap-2">
                        {tipo === "receita" ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-blue-500" />}
                        <h3 className="font-semibold">{tipo === "receita" ? "Receitas" : "Despesas"}</h3>
                      </div>
                      {DEFAULT_CATEGORIES.filter((group) => group.tipo === tipo).map((group) => (
                        <label
                          key={group.nome}
                          className="flex gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedStarterGroups.has(group.nome)}
                            onCheckedChange={() => toggleStarterGroup(group.nome)}
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: group.cor }} />
                              <span className="font-medium">{group.nome}</span>
                              <Badge variant="secondary" className="ml-auto">{group.subcategorias.length}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {group.subcategorias.join(", ")}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStarterPackOpen(false)} disabled={starterPackLoading}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateStarterPack} disabled={starterPackLoading || selectedStarterGroups.size === 0} className="gradient-primary text-primary-foreground">
                    {starterPackLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar Selecionadas
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button
                className="gradient-primary text-primary-foreground sm:px-5 px-0 sm:w-auto w-10"
                onClick={() => setFormData({ ...formData, tipo: activeTab })}
                aria-label="Nova categoria"
                title="Nova categoria"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Nova Categoria</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Nova"} Categoria</DialogTitle>
                <DialogDescription>
                  Preencha os dados da categoria abaixo.
                </DialogDescription>
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
                  <ColorPicker value={formData.cor} onChange={(cor) => setFormData({ ...formData, cor })} />
                </div>

                <div className="space-y-2">
                  <Label>Categoria Pai (opcional)</Label>
                  <Select 
                    value={formData.categoria_pai_id} 
                    onValueChange={(v) => setFormData({ ...formData, categoria_pai_id: v === "_none_" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhuma (categoria principal)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none_">Nenhuma (categoria principal)</SelectItem>
                      {availableParentCategorias.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.cor }} />
                            {cat.nome}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Selecione uma categoria pai para criar uma subcategoria
                  </p>
                </div>

                <Button type="submit" className="w-full gradient-primary text-primary-foreground">
                  {editingId ? "Atualizar" : "Criar"} Categoria
                </Button>
              </form>
            </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar categorias..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
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
            {isTabSwitching ? (
              <TabContentSkeleton variant="list" />
            ) : (
              renderList(
                paginatedParents,
                searchTerm ? "Nenhuma categoria encontrada" : "Nenhuma categoria de despesa cadastrada",
              )
            )}
          </TabsContent>

          <TabsContent value="receita" className="mt-4">
            {isTabSwitching ? (
              <TabContentSkeleton variant="list" />
            ) : (
              renderList(
                paginatedParents,
                searchTerm ? "Nenhuma categoria encontrada" : "Nenhuma categoria de receita cadastrada",
              )
            )}
          </TabsContent>
        </Tabs>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {startIndex + 1} - {Math.min(startIndex + ITEMS_PER_PAGE, mainCategorias.length)} de {mainCategorias.length} categorias principais
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
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    className="w-8"
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                ))}
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

export default Categorias;