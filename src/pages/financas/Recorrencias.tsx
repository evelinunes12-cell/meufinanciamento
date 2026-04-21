import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isAfter, isBefore, startOfDay, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Repeat,
  MoreVertical,
  CheckCircle2,
  Pencil,
  Pause,
  Play,
  X,
  TrendingDown,
  TrendingUp,
  CalendarClock,
  Inbox,
} from "lucide-react";

import AppLayout from "@/components/AppLayout";
import PageLoadingSkeleton from "@/components/PageLoadingSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// ---------------- Types ----------------
interface Categoria {
  id: string;
  nome: string;
  cor: string;
  tipo: string;
}
interface Conta {
  id: string;
  nome_conta: string;
  cor: string;
  tipo: string;
}
interface Transacao {
  id: string;
  descricao: string | null;
  tipo: string; // receita | despesa
  valor: number;
  data: string; // competence
  data_pagamento: string | null;
  is_pago_executado: boolean | null;
  recorrencia: string | null;
  categoria_id: string | null;
  conta_id: string;
  forma_pagamento: string;
}

interface RecurrenceGroup {
  key: string;
  descricao: string;
  tipo: "receita" | "despesa";
  categoria_id: string | null;
  conta_id: string;
  valor: number; // base monthly value (latest active occurrence)
  isPaused: boolean;
  transacoes: Transacao[];
  currentMonthTx: Transacao | null;
  nextDueTx: Transacao | null;
}

// ---------------- Utils ----------------
const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const groupKey = (t: Pick<Transacao, "descricao" | "tipo" | "categoria_id">) =>
  `${(t.descricao ?? "").trim().toLowerCase()}|${t.tipo}|${t.categoria_id ?? "null"}`;

const dueDateOf = (t: Transacao) => parseISO(t.data_pagamento ?? t.data);

// ---------------- Page ----------------
const RecorrenciasPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"despesa" | "receita" | "pausada">("despesa");

  // Edit modal state
  const [editGroup, setEditGroup] = useState<RecurrenceGroup | null>(null);
  const [editValor, setEditValor] = useState("");
  const [editContaId, setEditContaId] = useState("");

  // Cancel confirm state
  const [cancelGroup, setCancelGroup] = useState<RecurrenceGroup | null>(null);

  // ---------- Queries ----------
  const { data: contas = [] } = useQuery({
    queryKey: ["contas", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas")
        .select("id, nome_conta, cor, tipo");
      if (error) throw error;
      return (data ?? []) as Conta[];
    },
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorias")
        .select("id, nome, cor, tipo");
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });

  const { data: transacoes = [], isLoading } = useQuery({
    queryKey: ["recorrencias-fixas", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transacoes")
        .select(
          "id, descricao, tipo, valor, data, data_pagamento, is_pago_executado, recorrencia, categoria_id, conta_id, forma_pagamento"
        )
        .in("recorrencia", ["fixa", "pausada"])
        .order("data", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Transacao[];
    },
  });

  const contasMap = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);
  const categoriasMap = useMemo(
    () => new Map(categorias.map((c) => [c.id, c])),
    [categorias]
  );

  // ---------- Group transactions ----------
  const groups = useMemo<RecurrenceGroup[]>(() => {
    const today = startOfDay(new Date());
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const map = new Map<string, Transacao[]>();
    for (const t of transacoes) {
      const k = groupKey(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }

    const result: RecurrenceGroup[] = [];
    for (const [k, txs] of map.entries()) {
      const sorted = [...txs].sort(
        (a, b) => dueDateOf(a).getTime() - dueDateOf(b).getTime()
      );
      const first = sorted[0];

      // Current month occurrence (by competence date)
      const currentMonthTx =
        sorted.find((t) =>
          isWithinInterval(parseISO(t.data), { start: monthStart, end: monthEnd })
        ) ?? null;

      // Next pending due date from today
      const nextDueTx =
        sorted.find(
          (t) =>
            !t.is_pago_executado &&
            !isBefore(dueDateOf(t), today)
        ) ?? null;

      // Determine paused: a group is paused if every FUTURE occurrence is "pausada"
      // and there is no active "fixa" occurrence in the future.
      const futurePending = sorted.filter(
        (t) => !t.is_pago_executado && !isBefore(dueDateOf(t), today)
      );
      const hasActiveFuture = futurePending.some((t) => t.recorrencia === "fixa");
      const hasPausedFuture = futurePending.some((t) => t.recorrencia === "pausada");
      const isPaused = !hasActiveFuture && hasPausedFuture;

      // Base value = next active future occurrence value, fallback to most recent
      const baseValor =
        futurePending.find((t) => t.recorrencia === "fixa")?.valor ??
        sorted[sorted.length - 1]?.valor ??
        first.valor;

      result.push({
        key: k,
        descricao: first.descricao?.trim() || "(Sem descrição)",
        tipo: first.tipo as "receita" | "despesa",
        categoria_id: first.categoria_id,
        conta_id:
          futurePending.find((t) => t.recorrencia === "fixa")?.conta_id ??
          sorted[sorted.length - 1]?.conta_id ??
          first.conta_id,
        valor: Number(baseValor),
        isPaused,
        transacoes: sorted,
        currentMonthTx,
        nextDueTx,
      });
    }
    return result;
  }, [transacoes]);

  // ---------- KPIs ----------
  const kpis = useMemo(() => {
    const activeGroups = groups.filter((g) => !g.isPaused);
    const despesasMes = activeGroups
      .filter((g) => g.tipo === "despesa")
      .reduce((acc, g) => acc + g.valor, 0);
    const receitasMes = activeGroups
      .filter((g) => g.tipo === "receita")
      .reduce((acc, g) => acc + g.valor, 0);

    const today = startOfDay(new Date());
    const upcoming = activeGroups
      .filter((g) => g.tipo === "despesa" && g.nextDueTx)
      .map((g) => ({ g, due: dueDateOf(g.nextDueTx!) }))
      .filter((x) => !isBefore(x.due, today))
      .sort((a, b) => a.due.getTime() - b.due.getTime());
    const proximo = upcoming[0] ?? null;

    return { despesasMes, receitasMes, proximo };
  }, [groups]);

  // ---------- Filtered tabs ----------
  const despesasGroups = groups.filter((g) => g.tipo === "despesa" && !g.isPaused);
  const receitasGroups = groups.filter((g) => g.tipo === "receita" && !g.isPaused);
  const pausadasGroups = groups.filter((g) => g.isPaused);

  // ---------- Mutations ----------
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["recorrencias-fixas"] });
    queryClient.invalidateQueries({ queryKey: ["transacoes"] });
    queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-financas"] });
    queryClient.invalidateQueries({ queryKey: ["projecao"] });
  };

  const handleConfirmarPagamento = async (group: RecurrenceGroup) => {
    if (!group.currentMonthTx || group.currentMonthTx.is_pago_executado) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const { error } = await supabase
      .from("transacoes")
      .update({
        is_pago_executado: true,
        data_execucao_pagamento: today,
        data_pagamento: group.currentMonthTx.data_pagamento ?? today,
      })
      .eq("id", group.currentMonthTx.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pagamento confirmado", description: group.descricao });
    invalidate();
  };

  const openEditModal = (group: RecurrenceGroup) => {
    setEditGroup(group);
    setEditValor(group.valor.toFixed(2));
    setEditContaId(group.conta_id);
  };

  const handleSaveEdit = async () => {
    if (!editGroup) return;
    const novoValor = Number(editValor);
    if (!Number.isFinite(novoValor) || novoValor <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    const today = format(startOfDay(new Date()), "yyyy-MM-dd");
    // IDs of this group's PENDING transactions whose due date >= today
    const idsAlvo = editGroup.transacoes
      .filter(
        (t) =>
          !t.is_pago_executado &&
          (t.data_pagamento ?? t.data) >= today
      )
      .map((t) => t.id);

    if (idsAlvo.length === 0) {
      toast({
        title: "Nada a alterar",
        description: "Não há ocorrências futuras pendentes nesta recorrência.",
      });
      setEditGroup(null);
      return;
    }

    const { error } = await supabase
      .from("transacoes")
      .update({ valor: novoValor, conta_id: editContaId })
      .in("id", idsAlvo);

    if (error) {
      toast({ title: "Erro ao editar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Recorrência atualizada",
      description: `${idsAlvo.length} ocorrência(s) futura(s) atualizada(s).`,
    });
    setEditGroup(null);
    invalidate();
  };

  const handlePause = async (group: RecurrenceGroup) => {
    const today = format(startOfDay(new Date()), "yyyy-MM-dd");
    const idsAlvo = group.transacoes
      .filter(
        (t) =>
          !t.is_pago_executado &&
          (t.data_pagamento ?? t.data) >= today &&
          t.recorrencia === "fixa"
      )
      .map((t) => t.id);

    if (idsAlvo.length === 0) {
      toast({ title: "Nada a pausar", description: "Sem ocorrências futuras ativas." });
      return;
    }
    const { error } = await supabase
      .from("transacoes")
      .update({ recorrencia: "pausada" })
      .in("id", idsAlvo);
    if (error) {
      toast({ title: "Erro ao pausar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Recorrência pausada", description: `${idsAlvo.length} ocorrência(s) pausada(s).` });
    invalidate();
  };

  const handleResume = async (group: RecurrenceGroup) => {
    const today = format(startOfDay(new Date()), "yyyy-MM-dd");
    const idsAlvo = group.transacoes
      .filter(
        (t) =>
          !t.is_pago_executado &&
          (t.data_pagamento ?? t.data) >= today &&
          t.recorrencia === "pausada"
      )
      .map((t) => t.id);

    if (idsAlvo.length === 0) return;
    const { error } = await supabase
      .from("transacoes")
      .update({ recorrencia: "fixa" })
      .in("id", idsAlvo);
    if (error) {
      toast({ title: "Erro ao retomar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Recorrência retomada" });
    invalidate();
  };

  const handleCancel = async () => {
    if (!cancelGroup) return;
    const today = format(startOfDay(new Date()), "yyyy-MM-dd");
    const idsAlvo = cancelGroup.transacoes
      .filter(
        (t) =>
          !t.is_pago_executado &&
          (t.data_pagamento ?? t.data) > today
      )
      .map((t) => t.id);

    if (idsAlvo.length === 0) {
      toast({ title: "Nada a cancelar", description: "Sem ocorrências futuras pendentes." });
      setCancelGroup(null);
      return;
    }
    const { error } = await supabase.from("transacoes").delete().in("id", idsAlvo);
    if (error) {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Recorrência cancelada",
      description: `${idsAlvo.length} ocorrência(s) futura(s) excluída(s). Histórico preservado.`,
    });
    setCancelGroup(null);
    invalidate();
  };

  // ---------- Render helpers ----------
  const renderCard = (group: RecurrenceGroup) => {
    const cat = group.categoria_id ? categoriasMap.get(group.categoria_id) : null;
    const conta = contasMap.get(group.conta_id);
    const today = startOfDay(new Date());

    let statusBadge: JSX.Element | null = null;
    if (group.isPaused) {
      statusBadge = (
        <Badge variant="secondary" className="gap-1">
          <Pause className="h-3 w-3" /> Pausada
        </Badge>
      );
    } else if (group.currentMonthTx) {
      if (group.currentMonthTx.is_pago_executado) {
        statusBadge = (
          <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600/90 border-transparent">
            <CheckCircle2 className="h-3 w-3" /> Pago
          </Badge>
        );
      } else {
        const due = dueDateOf(group.currentMonthTx);
        const overdue = isBefore(due, today);
        statusBadge = (
          <Badge
            className={
              overdue
                ? "gap-1 bg-destructive text-destructive-foreground border-transparent"
                : "gap-1 bg-amber-500 text-white hover:bg-amber-500/90 border-transparent"
            }
          >
            <CalendarClock className="h-3 w-3" />
            {overdue ? "Atrasado" : "Pendente"} • {format(due, "dd/MM")}
          </Badge>
        );
      }
    } else {
      statusBadge = <Badge variant="outline">Sem ocorrência neste mês</Badge>;
    }

    const canConfirm =
      !group.isPaused &&
      group.currentMonthTx &&
      !group.currentMonthTx.is_pago_executado;

    return (
      <Card key={group.key} className="relative overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold truncate">
              {group.descricao}
            </CardTitle>
            {cat && (
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.cor }}
                  aria-hidden="true"
                />
                <span className="text-xs text-muted-foreground truncate">
                  {cat.nome}
                </span>
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Ações</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                disabled={!canConfirm}
                onClick={() => handleConfirmarPagamento(group)}
              >
                <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                Confirmar pagamento
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openEditModal(group)}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar valor / conta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {group.isPaused ? (
                <DropdownMenuItem onClick={() => handleResume(group)}>
                  <Play className="h-4 w-4 mr-2" />
                  Retomar recorrência
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => handlePause(group)}>
                  <Pause className="h-4 w-4 mr-2" />
                  Pausar recorrência
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setCancelGroup(group)}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar recorrência
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={
                group.tipo === "despesa"
                  ? "text-2xl font-bold text-destructive"
                  : "text-2xl font-bold text-emerald-600"
              }
            >
              {formatCurrency(group.valor)}
            </span>
            <span className="text-xs text-muted-foreground">/ mês</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">
              {conta ? conta.nome_conta : "Conta não encontrada"}
            </span>
            {statusBadge}
          </div>
        </CardContent>
      </Card>
    );
  };

  const emptyState = (label: string) => (
    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
      <Inbox className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-sm">{label}</p>
    </div>
  );

  // ---------- Loading ----------
  if (isLoading) {
    return (
      <AppLayout>
        <PageLoadingSkeleton type="tabs" title="Recorrências" />
      </AppLayout>
    );
  }

  // ---------- Render ----------
  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-soft">
            <Repeat className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Recorrências</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie assinaturas, despesas e receitas fixas em um só lugar.
            </p>
          </div>
        </header>

        {/* KPIs */}
        <section
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          aria-label="Indicadores de recorrências"
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                Despesas fixas / mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(kpis.despesasMes)}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {despesasGroups.length} recorrência(s) ativa(s)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Receitas fixas / mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <p className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(kpis.receitasMes)}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {receitasGroups.length} recorrência(s) ativa(s)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-500" />
                Próximo vencimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-40" />
              ) : kpis.proximo ? (
                <>
                  <p className="text-lg font-semibold truncate">
                    {kpis.proximo.g.descricao}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(kpis.proximo.due, "dd 'de' MMMM", { locale: ptBR })} •{" "}
                    {formatCurrency(kpis.proximo.g.valor)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma despesa pendente
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 max-w-xl">
            <TabsTrigger value="despesa">
              Despesas{" "}
              <span className="ml-1.5 text-xs opacity-70">
                ({despesasGroups.length})
              </span>
            </TabsTrigger>
            <TabsTrigger value="receita">
              Receitas{" "}
              <span className="ml-1.5 text-xs opacity-70">
                ({receitasGroups.length})
              </span>
            </TabsTrigger>
            <TabsTrigger value="pausada">
              Pausadas{" "}
              <span className="ml-1.5 text-xs opacity-70">
                ({pausadasGroups.length})
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="despesa">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-44 w-full rounded-lg" />
                  ))
                : despesasGroups.length === 0
                ? emptyState("Nenhuma despesa fixa cadastrada ainda.")
                : despesasGroups.map(renderCard)}
            </div>
          </TabsContent>

          <TabsContent value="receita">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-44 w-full rounded-lg" />
                  ))
                : receitasGroups.length === 0
                ? emptyState("Nenhuma receita fixa cadastrada ainda.")
                : receitasGroups.map(renderCard)}
            </div>
          </TabsContent>

          <TabsContent value="pausada">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading
                ? Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-44 w-full rounded-lg" />
                  ))
                : pausadasGroups.length === 0
                ? emptyState("Nenhuma recorrência pausada.")
                : pausadasGroups.map(renderCard)}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editGroup} onOpenChange={(o) => !o && setEditGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar recorrência</DialogTitle>
            <DialogDescription>
              As alterações serão aplicadas apenas em ocorrências futuras pendentes.
              O histórico permanece intacto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rec-valor">Novo valor (R$)</Label>
              <Input
                id="rec-valor"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={editValor}
                onChange={(e) => setEditValor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rec-conta">Conta vinculada</Label>
              <Select value={editContaId} onValueChange={setEditContaId}>
                <SelectTrigger id="rec-conta">
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome_conta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGroup(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>Salvar alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancelGroup} onOpenChange={(o) => !o && setCancelGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar recorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá excluir todas as ocorrências futuras pendentes de{" "}
              <strong>{cancelGroup?.descricao}</strong>. O histórico passado e
              ocorrências já pagas serão <strong>preservados</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default RecorrenciasPage;
