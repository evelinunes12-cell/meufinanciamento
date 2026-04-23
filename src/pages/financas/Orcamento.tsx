import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, AlertTriangle, CheckCircle, ChevronDown, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { isExecutado, getDataEfetiva } from "@/lib/transactions";

interface OrcamentoType {
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
  categoria_pai_id: string | null;
}

interface Transacao {
  id: string;
  categoria_id: string | null;
  valor: number;
  tipo: string;
  data: string;
  data_pagamento: string | null;
  forma_pagamento: string;
  is_pago_executado: boolean | null;
  conta_id: string;
}

interface Conta {
  id: string;
  tipo: string;
  dia_fechamento: number | null;
}

async function fetchOrcamentoData(userId: string | undefined, mesAtual: string) {
  if (!userId) return null;

  const [orcamentosRes, categoriasRes, transacoesRes, contasRes] = await Promise.all([
    supabase.from("orcamentos").select("*").eq("mes_referencia", mesAtual),
    supabase.from("categorias").select("*").eq("tipo", "despesa"),
    supabase.from("transacoes").select("*").eq("tipo", "despesa"),
    supabase.from("contas").select("id, tipo, dia_fechamento"),
  ]);

  return {
    orcamentos: (orcamentosRes.data || []) as OrcamentoType[],
    categorias: (categoriasRes.data || []) as Categoria[],
    transacoes: (transacoesRes.data || []) as Transacao[],
    contas: (contasRes.data || []) as Conta[],
  };
}

const Orcamento = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [incluirPendentes, setIncluirPendentes] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    categoria_id: "",
    valor_limite: "",
  });

  const mesAtual = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["orcamentos", user?.id, mesAtual],
    queryFn: () => fetchOrcamentoData(user?.id, mesAtual),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const orcamentos = data?.orcamentos || [];
  const categorias = data?.categorias || [];
  const transacoes = data?.transacoes || [];
  const contas = data?.contas || [];

  const mesAtualDate = new Date();
  const startMes = startOfMonth(mesAtualDate);
  const endMes = endOfMonth(mesAtualDate);

  const transacoesMesAtual = transacoes.filter(t => {
    const dataEfetiva = getDataEfetiva(t, contas);
    const dataEfetivaDate = parseISO(dataEfetiva);
    return !isBefore(dataEfetivaDate, startMes) && !isAfter(dataEfetivaDate, endMes);
  });

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

  const handleEdit = (orcamento: OrcamentoType) => {
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const getCategoriaNome = (id: string) => categorias.find(c => c.id === id)?.nome || "-";
  const getCategoriaCor = (id: string) => categorias.find(c => c.id === id)?.cor || "#888";
  const getCategoria = (id: string) => categorias.find(c => c.id === id);

  const getAllSubcategoriaIds = (catId: string): string[] => {
    const children = categorias.filter(c => c.categoria_pai_id === catId);
    return children.flatMap(child => [child.id, ...getAllSubcategoriaIds(child.id)]);
  };

  // Get spending for a SINGLE category only (no children)
  const getGastosDiretos = (categoriaId: string) => {
    return transacoesMesAtual
      .filter(t =>
        t.categoria_id === categoriaId &&
        t.forma_pagamento !== "transferencia" &&
        (incluirPendentes || isExecutado(t.is_pago_executado))
      )
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  // Get spending for a category INCLUDING all children
  const getGastosCategoria = (categoriaId: string) => {
    const allIds = [categoriaId, ...getAllSubcategoriaIds(categoriaId)];
    return transacoesMesAtual
      .filter(t =>
        t.categoria_id &&
        allIds.includes(t.categoria_id) &&
        t.forma_pagamento !== "transferencia" &&
        (incluirPendentes || isExecutado(t.is_pago_executado))
      )
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  const mainCategorias = categorias.filter(c => !c.categoria_pai_id);
  const getSubcategorias = (paiId: string) => categorias.filter(c => c.categoria_pai_id === paiId);

  // Available categories: main + subcategories, excluding those that already have a budget
  const categoriasDisponiveis = categorias.filter(c => {
    const jaTemOrcamento = orcamentos.some(o => o.categoria_id === c.id);
    const isEditingSame = editingId && orcamentos.find(o => o.id === editingId)?.categoria_id === c.id;
    return !jaTemOrcamento || isEditingSame;
  });

  // Group available categories for the select: main categories first, then subcategories indented
  const categoriasParaSelect = () => {
    const result: { id: string; nome: string; isSubcat: boolean; cor: string }[] = [];
    mainCategorias.forEach(main => {
      if (categoriasDisponiveis.find(c => c.id === main.id)) {
        result.push({ id: main.id, nome: main.nome, isSubcat: false, cor: main.cor });
      }
      getSubcategorias(main.id).forEach(sub => {
        if (categoriasDisponiveis.find(c => c.id === sub.id)) {
          result.push({ id: sub.id, nome: sub.nome, isSubcat: true, cor: sub.cor });
        }
      });
    });
    return result;
  };

  // Group budgets by main category for hierarchical display
  const getOrcamentosHierarquicos = () => {
    const groups: {
      mainCatId: string;
      mainOrcamento: OrcamentoType | null;
      subOrcamentos: OrcamentoType[];
    }[] = [];

    const processedCatIds = new Set<string>();

    // First, group by main category
    mainCategorias.forEach(main => {
      const mainOrc = orcamentos.find(o => o.categoria_id === main.id) || null;
      const subs = getSubcategorias(main.id);
      const subOrcs = orcamentos.filter(o => subs.some(s => s.id === o.categoria_id));

      if (mainOrc || subOrcs.length > 0) {
        groups.push({ mainCatId: main.id, mainOrcamento: mainOrc, subOrcamentos: subOrcs });
        if (mainOrc) processedCatIds.add(mainOrc.categoria_id);
        subOrcs.forEach(so => processedCatIds.add(so.categoria_id));
      }
    });

    // Any orphan budgets (subcats whose parent has no budget and isn't grouped)
    orcamentos.forEach(o => {
      if (!processedCatIds.has(o.categoria_id)) {
        const cat = getCategoria(o.categoria_id);
        if (cat?.categoria_pai_id) {
          const existing = groups.find(g => g.mainCatId === cat.categoria_pai_id);
          if (existing) {
            existing.subOrcamentos.push(o);
          } else {
            groups.push({ mainCatId: cat.categoria_pai_id!, mainOrcamento: null, subOrcamentos: [o] });
          }
        } else {
          groups.push({ mainCatId: o.categoria_id, mainOrcamento: o, subOrcamentos: [] });
        }
      }
    });

    return groups;
  };

  const toggleExpand = (catId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const renderStatusIcon = (percentual: number) => {
    if (percentual >= 100) return <Badge variant="destructive" className="text-xs">Excedido</Badge>;
    if (percentual >= 90) return <AlertTriangle className="h-4 w-4 text-warning" />;
    return <CheckCircle className="h-4 w-4 text-success" />;
  };

  const renderProgressBar = (percentual: number) => {
    const status = percentual >= 100 ? "excedido" : percentual >= 90 ? "alerta" : "ok";
    return (
      <Progress
        value={Math.min(percentual, 100)}
        className={`h-2 ${status === "excedido" ? "[&>div]:bg-destructive" : status === "alerta" ? "[&>div]:bg-warning" : ""}`}
      />
    );
  };

  if (isLoading) {
    return (
      <AppLayout>
        <PageLoadingSkeleton type="list" title="Orçamento Mensal" />
      </AppLayout>
    );
  }

  const hierarquicos = getOrcamentosHierarquicos();

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
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={incluirPendentes}
                onCheckedChange={(checked) => setIncluirPendentes(checked === true)}
              />
              Incluir pendentes
            </label>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button
                className="gradient-primary text-primary-foreground sm:w-auto w-10 sm:px-5 px-0"
                disabled={categoriasDisponiveis.length === 0}
                aria-label="Definir limite"
                title="Definir limite"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Definir Limite</span>
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
                      {(() => {
                        const mainCats = categoriasDisponiveis.filter(c => !c.categoria_pai_id);
                        const subCats = categoriasDisponiveis.filter(c => c.categoria_pai_id);
                        const items: React.ReactNode[] = [];

                        mainCats.forEach((main) => {
                          items.push(
                            <SelectItem key={main.id} value={main.id} className="font-semibold">
                              {main.nome}
                            </SelectItem>
                          );
                          const children = subCats.filter(s => s.categoria_pai_id === main.id);
                          children.forEach((sub) => {
                            items.push(
                              <SelectItem key={sub.id} value={sub.id} className="pl-8 text-muted-foreground">
                                └ {sub.nome}
                              </SelectItem>
                            );
                          });
                        });

                        // Orphan subcategories (parent not in available list)
                        const groupedSubIds = new Set(subCats.filter(s => mainCats.some(m => m.id === s.categoria_pai_id)).map(s => s.id));
                        subCats.filter(s => !groupedSubIds.has(s.id)).forEach((sub) => {
                          const parentName = categorias.find(c => c.id === sub.categoria_pai_id)?.nome;
                          items.push(
                            <SelectItem key={sub.id} value={sub.id} className="pl-8 text-muted-foreground">
                              {parentName ? `${parentName} › ` : ""}{sub.nome}
                            </SelectItem>
                          );
                        });

                        return items;
                      })()}
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
        </div>

        {hierarquicos.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum orçamento definido</h3>
              <p className="text-muted-foreground text-center mb-4">
                Defina limites de gastos por categoria e subcategoria para controlar seu orçamento
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hierarquicos.map((group) => {
              const mainCat = getCategoria(group.mainCatId);
              const mainCor = mainCat?.cor || "#888";
              const mainNome = mainCat?.nome || "-";
              const hasSubOrcamentos = group.subOrcamentos.length > 0;
              const isExpanded = expandedCards.has(group.mainCatId);

              // Total spending for the main category (including all subs)
              const gastosTotalMain = getGastosCategoria(group.mainCatId);

              // Main budget values
              const mainLimite = group.mainOrcamento ? Number(group.mainOrcamento.valor_limite) : 0;

              // Sum of sub-budget limits
              const subLimitesTotal = group.subOrcamentos.reduce((acc, so) => acc + Number(so.valor_limite), 0);
              const limiteTotal = mainLimite + subLimitesTotal;

              // If there's no main budget but has sub-budgets, use combined sub limits
              const limiteExibido = limiteTotal > 0 ? limiteTotal : mainLimite;
              const percentual = limiteExibido > 0 ? (gastosTotalMain / limiteExibido) * 100 : 0;
              const restante = limiteExibido - gastosTotalMain;

              return (
                <Card key={group.mainCatId} className="shadow-card overflow-hidden">
                  <div className="h-2" style={{ backgroundColor: mainCor }} />
                  <CardContent className="p-4">
                    {/* Main category header */}
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={`flex items-center gap-2 ${hasSubOrcamentos ? "cursor-pointer" : ""}`}
                        onClick={() => hasSubOrcamentos && toggleExpand(group.mainCatId)}
                      >
                        {hasSubOrcamentos && (
                          isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: mainCor }} />
                        <h3 className="font-semibold text-foreground">{mainNome}</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        {limiteExibido > 0 && renderStatusIcon(percentual)}
                      </div>
                    </div>

                    {/* Main category progress */}
                    {limiteExibido > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Gasto total</span>
                          <span className={`font-medium ${percentual >= 100 ? "text-destructive" : "text-foreground"}`}>
                            {formatCurrency(gastosTotalMain)}
                          </span>
                        </div>
                        {renderProgressBar(percentual)}
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{percentual.toFixed(1)}%</span>
                          <span>Limite: {formatCurrency(limiteExibido)}</span>
                        </div>
                      </div>
                    )}

                    {/* Subcategory budgets (expandable) */}
                    {hasSubOrcamentos && isExpanded && (
                      <div className="mt-4 pt-3 border-t border-border space-y-3">
                        {/* If main cat has its own budget, show direct spending */}
                        {group.mainOrcamento && (
                          <div className="space-y-1.5 pl-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: mainCor }} />
                                <span className="text-sm text-foreground">{mainNome} (direto)</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(group.mainOrcamento!)}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(group.mainOrcamento!.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            {(() => {
                              const gastoDir = getGastosDiretos(group.mainOrcamento!.categoria_id);
                              const limDir = Number(group.mainOrcamento!.valor_limite);
                              const pctDir = limDir > 0 ? (gastoDir / limDir) * 100 : 0;
                              return (
                                <>
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>{formatCurrency(gastoDir)}</span>
                                    <span>Limite: {formatCurrency(limDir)}</span>
                                  </div>
                                  {renderProgressBar(pctDir)}
                                </>
                              );
                            })()}
                          </div>
                        )}

                        {group.subOrcamentos.map(subOrc => {
                          const subCat = getCategoria(subOrc.categoria_id);
                          const subGastos = getGastosCategoria(subOrc.categoria_id);
                          const subLimite = Number(subOrc.valor_limite);
                          const subPct = subLimite > 0 ? (subGastos / subLimite) * 100 : 0;

                          return (
                            <div key={subOrc.id} className="space-y-1.5 pl-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: subCat?.cor || "#888" }} />
                                  <span className="text-sm text-foreground">{subCat?.nome || "-"}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  {renderStatusIcon(subPct)}
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(subOrc)}>
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(subOrc.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{formatCurrency(subGastos)}</span>
                                <span>Limite: {formatCurrency(subLimite)}</span>
                              </div>
                              {renderProgressBar(subPct)}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Footer with remaining and actions */}
                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Restante</p>
                        <p className={`font-bold ${restante >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(restante)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {/* Only show edit/delete on main card if no subcategory expansion or if main has its own budget */}
                        {group.mainOrcamento && !hasSubOrcamentos && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(group.mainOrcamento!)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(group.mainOrcamento!.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
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
