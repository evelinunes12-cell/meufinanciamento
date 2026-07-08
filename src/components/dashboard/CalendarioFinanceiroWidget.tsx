import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, isSameDay, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  descricao: string | null;
  forma_pagamento: string;
  is_pago_executado: boolean | null;
  categoria_id: string | null;
  conta_id: string;
}

interface Categoria {
  id: string;
  nome: string;
  cor: string;
}

interface CalendarioFinanceiroWidgetProps {
  transacoes: Transacao[];
  categorias: Categoria[];
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function CalendarioFinanceiroWidget({ transacoes, categorias }: CalendarioFinanceiroWidgetProps) {
  const [mes, setMes] = useState<Date>(new Date());
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  const transacoesRelevantes = useMemo(
    () => transacoes.filter((t) => t.forma_pagamento !== "transferencia"),
    [transacoes]
  );

  // Agrupa por dia dentro do mês visível
  const { receitaDays, despesaDays, ambosDays, byDay } = useMemo(() => {
    const start = startOfMonth(mes);
    const end = endOfMonth(mes);
    const map = new Map<string, { receitas: number; despesas: number; items: Transacao[] }>();

    transacoesRelevantes.forEach((t) => {
      const d = parseISO(t.data);
      if (d < start || d > end) return;
      const key = format(d, "yyyy-MM-dd");
      const bucket = map.get(key) || { receitas: 0, despesas: 0, items: [] };
      const valor = Number(t.valor);
      if (t.tipo === "receita") bucket.receitas += valor;
      else if (t.tipo === "despesa") bucket.despesas += valor;
      bucket.items.push(t);
      map.set(key, bucket);
    });

    const receita: Date[] = [];
    const despesa: Date[] = [];
    const ambos: Date[] = [];

    map.forEach((v, key) => {
      const d = parseISO(key);
      if (v.receitas > 0 && v.despesas > 0) ambos.push(d);
      else if (v.receitas > 0) receita.push(d);
      else if (v.despesas > 0) despesa.push(d);
    });

    return { receitaDays: receita, despesaDays: despesa, ambosDays: ambos, byDay: map };
  }, [transacoesRelevantes, mes]);

  const selectedItems = useMemo(() => {
    if (!selected) return null;
    const key = format(selected, "yyyy-MM-dd");
    return byDay.get(key) || null;
  }, [selected, byDay]);

  const catMap = useMemo(() => {
    const m = new Map<string, Categoria>();
    categorias.forEach((c) => m.set(c.id, c));
    return m;
  }, [categorias]);

  return (
    <Card className="shadow-card h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Calendário Financeiro
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col items-center">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={setSelected}
              month={mes}
              onMonthChange={setMes}
              locale={ptBR}
              className={cn("p-2 pointer-events-auto rounded-md border")}
              modifiers={{
                receita: receitaDays,
                despesa: despesaDays,
                ambos: ambosDays,
              }}
              modifiersClassNames={{
                receita:
                  "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-success",
                despesa:
                  "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-destructive",
                ambos:
                  "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-warning",
              }}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success" /> Receita
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-destructive" /> Despesa
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-warning" /> Ambos
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-2">
              <p className="text-xs text-muted-foreground">
                {selected
                  ? format(selected, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                  : "Selecione um dia"}
              </p>
              {selectedItems && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedItems.receitas > 0 && (
                    <div className="flex items-center gap-1.5 rounded-md bg-success/10 text-success px-2 py-1 text-xs font-medium">
                      <TrendingUp className="h-3 w-3" />
                      {formatCurrency(selectedItems.receitas)}
                    </div>
                  )}
                  {selectedItems.despesas > 0 && (
                    <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 text-destructive px-2 py-1 text-xs font-medium">
                      <TrendingDown className="h-3 w-3" />
                      {formatCurrency(selectedItems.despesas)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1">
              {!selectedItems || selectedItems.items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum lançamento neste dia.
                </p>
              ) : (
                selectedItems.items
                  .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "receita" ? -1 : 1))
                  .map((t) => {
                    const cat = t.categoria_id ? catMap.get(t.categoria_id) : undefined;
                    const isReceita = t.tipo === "receita";
                    const pendente = t.is_pago_executado === false;
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/50 px-2.5 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: cat?.cor || (isReceita ? "hsl(var(--success))" : "hsl(var(--destructive))") }}
                          />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{t.descricao || "—"}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {cat?.nome || "Sem categoria"}
                              {pendente && " · pendente"}
                            </p>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "font-semibold tabular-nums whitespace-nowrap",
                            isReceita ? "text-success" : "text-destructive",
                            pendente && "opacity-70"
                          )}
                        >
                          {isReceita ? "+" : "-"}
                          {formatCurrency(Number(t.valor))}
                        </span>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CalendarioFinanceiroWidget;
