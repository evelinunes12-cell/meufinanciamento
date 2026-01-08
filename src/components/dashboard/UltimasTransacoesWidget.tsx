import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  descricao: string | null;
  categoria_id: string | null;
}

interface Categoria {
  id: string;
  nome: string;
  cor: string;
}

interface UltimasTransacoesWidgetProps {
  transacoes: Transacao[];
  categorias: Categoria[];
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
};

export function UltimasTransacoesWidget({ transacoes, categorias }: UltimasTransacoesWidgetProps) {
  const ultimasTransacoes = transacoes.slice(0, 5);

  const getCategoriaNome = (id: string | null) => {
    if (!id) return null;
    return categorias.find(c => c.id === id)?.nome || null;
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Últimas Transações</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[280px] pr-4">
          {ultimasTransacoes.length > 0 ? (
            <div className="space-y-3">
              {ultimasTransacoes.map((t) => {
                const categoriaNome = getCategoriaNome(t.categoria_id);
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${t.tipo === "receita" ? "bg-success/10" : "bg-destructive/10"}`}>
                        {t.tipo === "receita" ? (
                          <ArrowUpRight className="h-4 w-4 text-success" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {t.descricao || (t.tipo === "receita" ? "Receita" : "Despesa")}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{format(parseISO(t.data), "dd/MM", { locale: ptBR })}</span>
                          {categoriaNome && (
                            <>
                              <span>•</span>
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                {categoriaNome}
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className={`font-bold whitespace-nowrap ${t.tipo === "receita" ? "text-success" : "text-destructive"}`}>
                      {t.tipo === "receita" ? "+" : "-"}{formatCurrency(t.valor)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Nenhuma transação no período
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
