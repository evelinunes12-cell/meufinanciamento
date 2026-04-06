import { useMemo } from "react";
import { Bell } from "lucide-react";
import { addDays, differenceInCalendarDays, format, parseISO, setDate, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
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

interface Transacao {
  id: string;
  descricao: string | null;
  tipo: string;
  data_pagamento: string | null;
  is_pago_executado: boolean | null;
}

interface Conta {
  id: string;
  nome_conta: string;
  tipo: string;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}

interface Notificacao {
  id: string;
  message: string;
  dateTag: string;
}

const Notifications = () => {
  const queryClient = useQueryClient();

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

  const notifications = useMemo(() => {
    const hoje = startOfDay(new Date());
    const limite = startOfDay(addDays(hoje, 3));

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
      }));

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
            });
          }
        }
        return lista;
      });

    return [...alertasDespesas, ...alertasFatura].sort((a, b) => a.dateTag.localeCompare(b.dateTag));
  }, [contas, transacoes]);

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
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Sem alertas para os próximos dias.</p>
        ) : (
          <ScrollArea className="max-h-[320px]">
            <div className="space-y-2 p-2">
              {notifications.map((notification) => (
                <div key={notification.id} className="rounded-md border p-3 text-sm">
                  {notification.message}
                </div>
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
