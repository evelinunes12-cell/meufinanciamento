import { useState, useMemo, useCallback, useEffect } from "react";
import { Bell, Trash2, ExternalLink } from "lucide-react";
import { addDays, differenceInCalendarDays, format, parseISO, setDate, startOfDay, startOfMonth, endOfMonth, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDataEfetiva } from "@/lib/transactions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Transacao {
  id: string;
  descricao: string | null;
  tipo: string;
  data: string;
  data_pagamento: string | null;
  is_pago_executado: boolean | null;
  categoria_id: string | null;
  conta_id: string;
  forma_pagamento: string;
  valor: number;
}

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
  cor: string;
  categoria_pai_id: string | null;
}

interface Orcamento {
  id: string;
  categoria_id: string;
  valor_limite: number;
  mes_referencia: string;
}

interface Parcela {
  id: string;
  financiamento_id: string;
  numero_parcela: number;
  data_vencimento: string;
  valor_parcela: number;
  pago: boolean | null;
}

interface Financiamento {
  id: string;
  nome: string;
  tipo: string;
}

interface Notificacao {
  id: string;
  message: string;
  dateTag: string;
  route: string;
}

const ALERTA_ORCAMENTO_PCT = 90;
const LEMBRETE_QUINZENAL_KEY = "lembrete_quinzenal_dismissed_at";
const DIAS_INTERVALO_LEMBRETE = 15;
const DISMISSED_KEY_PREFIX = "notificacoes_dispensadas_";

const getDismissedKey = (userId: string | undefined) =>
  `${DISMISSED_KEY_PREFIX}${userId || "anon"}`;

const loadDismissed = (userId: string | undefined): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(getDismissedKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

const saveDismissed = (userId: string | undefined, ids: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getDismissedKey(userId), JSON.stringify(Array.from(ids)));
  } catch {
    // ignore quota errors
  }
};

const Notifications = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed(user?.id));
  const [lembreteQuinzenalDismissedAt, setLembreteQuinzenalDismissedAt] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(LEMBRETE_QUINZENAL_KEY);
  });

  // Recarrega a lista de dispensadas quando o usuário mudar
  useEffect(() => {
    setDismissed(loadDismissed(user?.id));
  }, [user?.id]);

  // Sync localStorage value if it changes externally
  useEffect(() => {
    const handler = () => {
      setLembreteQuinzenalDismissedAt(localStorage.getItem(LEMBRETE_QUINZENAL_KEY));
      setDismissed(loadDismissed(user?.id));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [user?.id]);

  const transacoes = useMemo(() => {
    const entradas = queryClient.getQueriesData({ queryKey: ["transacoes"] });
    const todos = entradas.flatMap(([, data]) => (Array.isArray(data) ? data : (data as { transacoes?: Transacao[] } | null)?.transacoes || []));
    return Array.from(new Map(todos.map((t) => [t.id, t])).values()) as Transacao[];
  }, [queryClient]);

  const contas = useMemo(() => {
    const contasDiretas = queryClient.getQueriesData({ queryKey: ["contas"] });
    const contasDashboard = queryClient.getQueriesData({ queryKey: ["dashboard-financas"] });

    const deContas = contasDiretas.flatMap(([, data]) => (Array.isArray(data) ? data : []));
    const deDashboard = contasDashboard.flatMap(([, data]) => ((data as { contas?: Conta[] } | null)?.contas || []));
    const todas = [...deContas, ...deDashboard] as Conta[];

    return Array.from(new Map(todas.map((c) => [c.id, c])).values());
  }, [queryClient]);

  const categorias = useMemo(() => {
    const entries = queryClient.getQueriesData({ queryKey: ["categorias"] });
    const orcEntries = queryClient.getQueriesData({ queryKey: ["orcamentos"] });
    const fromCat = entries.flatMap(([, data]) => (Array.isArray(data) ? data : []));
    const fromOrc = orcEntries.flatMap(([, data]) => ((data as { categorias?: Categoria[] } | null)?.categorias || []));
    const todas = [...fromCat, ...fromOrc] as Categoria[];
    return Array.from(new Map(todas.map((c) => [c.id, c])).values());
  }, [queryClient]);

  const orcamentos = useMemo(() => {
    const entries = queryClient.getQueriesData({ queryKey: ["orcamentos"] });
    const todos = entries.flatMap(([, data]) => {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      return (data as { orcamentos?: Orcamento[] })?.orcamentos || [];
    });
    return todos as Orcamento[];
  }, [queryClient]);

  // Fetch financing contracts and pending installments for due-date alerts
  const { data: parcelasComContrato = [] } = useQuery({
    queryKey: ["notifications-parcelas", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: contratos } = await supabase
        .from("financiamento")
        .select("id, nome, tipo")
        .eq("user_id", user.id);
      if (!contratos || contratos.length === 0) return [];

      const ids = contratos.map((c) => c.id);
      const hoje = format(new Date(), "yyyy-MM-dd");
      const limiteFuturo = format(addDays(new Date(), 7), "yyyy-MM-dd");
      const limitePassado = format(addDays(new Date(), -90), "yyyy-MM-dd");

      const { data: parcelas } = await supabase
        .from("parcelas")
        .select("id, financiamento_id, numero_parcela, data_vencimento, valor_parcela, pago")
        .in("financiamento_id", ids)
        .eq("pago", false)
        .gte("data_vencimento", limitePassado)
        .lte("data_vencimento", limiteFuturo);

      const contratoMap = new Map<string, Financiamento>(contratos.map((c) => [c.id, c as Financiamento]));
      return ((parcelas || []) as Parcela[]).map((p) => ({
        parcela: p,
        contrato: contratoMap.get(p.financiamento_id),
      }));
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 min
    refetchOnMount: true,
  });

  const allNotifications = useMemo(() => {
    const hoje = startOfDay(new Date());
    const limite = startOfDay(addDays(hoje, 3));

    // --- Alertas de despesas próximas do vencimento ---
    const alertasDespesas: Notificacao[] = transacoes
      .filter((t) => t.tipo === "despesa" && t.is_pago_executado === false && !!t.data_pagamento)
      .map((t) => {
        const dataVencimento = startOfDay(parseISO(t.data_pagamento as string));
        return { transacao: t, dataVencimento };
      })
      .filter(({ dataVencimento }) => dataVencimento >= hoje && dataVencimento <= limite)
      .map(({ transacao, dataVencimento }) => ({
        id: `despesa-${transacao.id}`,
        message: `Despesa ${transacao.descricao || "sem descrição"} vence dia ${format(dataVencimento, "dd/MM/yyyy")}`,
        dateTag: format(dataVencimento, "yyyy-MM-dd"),
        route: "/financas/transacoes",
      }));

    // --- Alertas de fatura de cartão ---
    const diasAFrente = (dia: number) => {
      const base = startOfDay(new Date());
      let dataAlvo = setDate(base, dia);
      if (dataAlvo < base) {
        dataAlvo = setDate(addDays(base, 31), dia);
      }
      return differenceInCalendarDays(dataAlvo, base);
    };

    const alertasFatura: Notificacao[] = contas
      .filter((conta) => conta.tipo === "credito")
      .flatMap((conta) => {
        const lista: Notificacao[] = [];
        if (conta.dia_fechamento) {
          const dias = diasAFrente(conta.dia_fechamento);
          if (dias >= 0 && dias <= 3) {
            lista.push({
              id: `fechamento-${conta.id}`,
              message: `A fatura do cartão ${conta.nome_conta} fecha em breve.`,
              dateTag: `${dias}`,
              route: "/financas/cartoes",
            });
          }
        }
        if (conta.dia_vencimento) {
          const dias = diasAFrente(conta.dia_vencimento);
          if (dias >= 0 && dias <= 3) {
            lista.push({
              id: `vencimento-${conta.id}`,
              message: `A fatura do cartão ${conta.nome_conta} vence em breve.`,
              dateTag: `${dias}`,
              route: "/financas/cartoes",
            });
          }
        }
        return lista;
      });

    // --- Alertas de orçamento próximo do limite (≥90%) ---
    const mesAtual = startOfMonth(new Date());
    const mesAtualStr = format(mesAtual, "yyyy-MM-dd");
    const startMes = startOfMonth(new Date());
    const endMes = endOfMonth(new Date());

    const orcamentosMesAtual = orcamentos.filter((o) => o.mes_referencia === mesAtualStr);

    const getAllSubcategoriaIds = (catId: string): string[] => {
      const children = categorias.filter((c) => c.categoria_pai_id === catId);
      return children.flatMap((child) => [child.id, ...getAllSubcategoriaIds(child.id)]);
    };

    const transacoesDespesaMes = transacoes.filter((t) => {
      if (t.tipo !== "despesa" || t.forma_pagamento === "transferencia") return false;
      const dataEfetiva = getDataEfetiva(t, contas);
      const d = parseISO(dataEfetiva);
      return !isBefore(d, startMes) && !isAfter(d, endMes);
    });

    const alertasOrcamento: Notificacao[] = orcamentosMesAtual
      .map((orc) => {
        const cat = categorias.find((c) => c.id === orc.categoria_id);
        if (!cat) return null;

        const allIds = [orc.categoria_id, ...getAllSubcategoriaIds(orc.categoria_id)];
        const gasto = transacoesDespesaMes
          .filter((t) => t.categoria_id && allIds.includes(t.categoria_id))
          .reduce((acc, t) => acc + Number(t.valor), 0);

        const pct = orc.valor_limite > 0 ? (gasto / orc.valor_limite) * 100 : 0;

        if (pct >= ALERTA_ORCAMENTO_PCT) {
          const pctFormatted = Math.round(pct);
          const exceeded = pct >= 100;
          return {
            id: `orcamento-${orc.id}`,
            message: exceeded
              ? `⚠️ Orçamento de "${cat.nome}" ultrapassado (${pctFormatted}% do limite).`
              : `Orçamento de "${cat.nome}" atingiu ${pctFormatted}% do limite.`,
            dateTag: "orcamento",
            route: "/financas/orcamento",
          } as Notificacao;
        }
        return null;
      })
      .filter(Boolean) as Notificacao[];

    // --- Alertas de vencimento de parcelas de financiamentos/empréstimos ---
    // Regra: 5 dias antes, 1 dia antes, no dia, e após vencimento (lembrete semanal)
    const alertasParcelas: Notificacao[] = parcelasComContrato
      .map(({ parcela, contrato }) => {
        if (!contrato) return null;
        const dataVenc = startOfDay(parseISO(parcela.data_vencimento));
        const diff = differenceInCalendarDays(dataVenc, hoje);
        const tipoLabel = contrato.tipo === "emprestimo" ? "Empréstimo" : "Financiamento";
        const nomeContrato = contrato.nome || tipoLabel;
        const valorFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(parcela.valor_parcela));
        const route = "/financiamento/parcelas";

        // Antes do vencimento: apenas 5 dias antes ou 1 dia antes
        if (diff === 5) {
          return {
            id: `parcela-${parcela.id}-5d`,
            message: `${tipoLabel} ${nomeContrato}: parcela ${parcela.numero_parcela} (${valorFormatado}) vence em 5 dias (${format(dataVenc, "dd/MM")}).`,
            dateTag: `a-${format(dataVenc, "yyyy-MM-dd")}`,
            route,
          } as Notificacao;
        }
        if (diff === 1) {
          return {
            id: `parcela-${parcela.id}-1d`,
            message: `${tipoLabel} ${nomeContrato}: parcela ${parcela.numero_parcela} (${valorFormatado}) vence amanhã.`,
            dateTag: `a-${format(dataVenc, "yyyy-MM-dd")}`,
            route,
          } as Notificacao;
        }
        if (diff === 0) {
          return {
            id: `parcela-${parcela.id}-hoje`,
            message: `⚠️ ${tipoLabel} ${nomeContrato}: parcela ${parcela.numero_parcela} (${valorFormatado}) vence hoje!`,
            dateTag: `a-${format(dataVenc, "yyyy-MM-dd")}`,
            route,
          } as Notificacao;
        }
        // Após vencimento: lembrete semanal (a cada 7 dias)
        if (diff < 0) {
          const diasAtraso = Math.abs(diff);
          // Mostrar no dia 1, 7, 14, 21... (dia 1 = primeiro dia após venc)
          if (diasAtraso === 1 || diasAtraso % 7 === 0) {
            return {
              id: `parcela-${parcela.id}-atrasada-${diasAtraso}`,
              message: `🔴 ${tipoLabel} ${nomeContrato}: parcela ${parcela.numero_parcela} (${valorFormatado}) está ${diasAtraso} dia${diasAtraso > 1 ? "s" : ""} em atraso.`,
              dateTag: `a-${format(dataVenc, "yyyy-MM-dd")}`,
              route,
            } as Notificacao;
          }
        }
        return null;
      })
      .filter(Boolean) as Notificacao[];

    // --- Lembrete quinzenal de atualização de transações ---
    const alertasQuinzenal: Notificacao[] = [];
    const hojeStr = format(hoje, "yyyy-MM-dd");
    const ultimoDismiss = lembreteQuinzenalDismissedAt ? parseISO(lembreteQuinzenalDismissedAt) : null;
    const diasDesdeUltimoDismiss = ultimoDismiss
      ? differenceInCalendarDays(hoje, startOfDay(ultimoDismiss))
      : Infinity;

    if (diasDesdeUltimoDismiss >= DIAS_INTERVALO_LEMBRETE) {
      alertasQuinzenal.push({
        id: `quinzenal-${hojeStr}`,
        message: "📝 Lembrete quinzenal: atualize seus registros de transações para manter o controle financeiro em dia.",
        dateTag: "quinzenal",
        route: "/financas/transacoes",
      });
    }

    return [
      ...alertasParcelas,
      ...alertasDespesas,
      ...alertasFatura,
      ...alertasOrcamento,
      ...alertasQuinzenal,
    ].sort((a, b) => a.dateTag.localeCompare(b.dateTag));
  }, [contas, transacoes, categorias, orcamentos, parcelasComContrato, lembreteQuinzenalDismissedAt]);

  const notifications = useMemo(
    () => allNotifications.filter((n) => !dismissed.has(n.id)),
    [allNotifications, dismissed]
  );

  const handleClearAll = useCallback(() => {
    setDismissed(new Set(allNotifications.map((n) => n.id)));
    // Se houver lembrete quinzenal entre os dispensados, registrar a data
    const temQuinzenal = allNotifications.some((n) => n.dateTag === "quinzenal");
    if (temQuinzenal) {
      const agora = new Date().toISOString();
      localStorage.setItem(LEMBRETE_QUINZENAL_KEY, agora);
      setLembreteQuinzenalDismissedAt(agora);
    }
  }, [allNotifications]);

  const handleNavigate = useCallback(
    (notification: Notificacao) => {
      // Se for o lembrete quinzenal, registrar dismissal
      if (notification.dateTag === "quinzenal") {
        const agora = new Date().toISOString();
        localStorage.setItem(LEMBRETE_QUINZENAL_KEY, agora);
        setLembreteQuinzenalDismissedAt(agora);
      }
      navigate(notification.route);
    },
    [navigate]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {notifications.length > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground">
              {notifications.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px]">
        <div className="flex items-center justify-between px-2">
          <DropdownMenuLabel className="px-0">Notificações</DropdownMenuLabel>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
              onClick={handleClearAll}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Sem alertas para os próximos dias.</p>
        ) : (
          <ScrollArea className="max-h-[320px]">
            <div className="space-y-2 p-2">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNavigate(notification)}
                  className="flex items-center gap-2 w-full rounded-md border p-3 text-sm text-left hover:bg-accent transition-colors cursor-pointer"
                >
                  <span className="flex-1">{notification.message}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
        <DropdownMenuSeparator />
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          Referência: {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Notifications;
