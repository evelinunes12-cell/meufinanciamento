import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertCircle, Calendar } from "lucide-react";
import { format, parseISO, endOfMonth, isAfter, isBefore, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo } from "react";

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  descricao: string | null;
  is_pago_executado: boolean | null;
  forma_pagamento: string;
  recorrencia?: string | null;
}

interface Conta {
  id: string;
  nome_conta: string;
  saldo_inicial: number;
  tipo: string;
}

interface ProjecaoFluxoCaixaWidgetProps {
  transacoes: Transacao[];
  contas: Conta[];
  saldoAtual: number;
}

export function ProjecaoFluxoCaixaWidget({ transacoes, contas, saldoAtual }: ProjecaoFluxoCaixaWidgetProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const projecao = useMemo(() => {
    const hoje = new Date();
    const inicioMes = startOfMonth(hoje);
    const fimMes = endOfMonth(hoje);

    // Filter pending transactions in current month
    const pendentes = transacoes.filter(t => {
      const dataTransacao = parseISO(t.data);
      return (
        t.is_pago_executado === false &&
        t.forma_pagamento !== "transferencia" &&
        !isBefore(dataTransacao, inicioMes) &&
        !isAfter(dataTransacao, fimMes)
      );
    });

    // Calculate pending amounts
    const receitasPendentes = pendentes
      .filter(t => t.tipo === "receita")
      .reduce((acc, t) => acc + Number(t.valor), 0);

    const despesasPendentes = pendentes
      .filter(t => t.tipo === "despesa")
      .reduce((acc, t) => acc + Number(t.valor), 0);

    const saldoProjetado = saldoAtual + receitasPendentes - despesasPendentes;

    return {
      pendentes: pendentes.sort((a, b) => parseISO(a.data).getTime() - parseISO(b.data).getTime()),
      receitasPendentes,
      despesasPendentes,
      saldoProjetado,
      fimMes,
    };
  }, [transacoes, saldoAtual]);

  const isPositive = projecao.saldoProjetado >= 0;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Projeção de Fluxo de Caixa
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Saldo projetado para {format(projecao.fimMes, "dd/MM/yyyy", { locale: ptBR })}
        </p>
      </CardHeader>
      <CardContent>
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground mb-1">Saldo Atual</p>
            <p className={`text-sm font-bold ${saldoAtual >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(saldoAtual)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-success/10 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-success" />
              <p className="text-xs text-muted-foreground">A Receber</p>
            </div>
            <p className="text-sm font-bold text-success">
              +{formatCurrency(projecao.receitasPendentes)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-destructive/10 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingDown className="h-3 w-3 text-destructive" />
              <p className="text-xs text-muted-foreground">A Pagar</p>
            </div>
            <p className="text-sm font-bold text-destructive">
              -{formatCurrency(projecao.despesasPendentes)}
            </p>
          </div>
        </div>

        {/* Projected Balance */}
        <div className={`p-4 rounded-lg mb-4 ${isPositive ? "bg-success/10 border border-success/20" : "bg-destructive/10 border border-destructive/20"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isPositive && <AlertCircle className="h-4 w-4 text-destructive" />}
              <span className="text-sm font-medium">Saldo Projetado</span>
            </div>
            <span className={`text-lg font-bold ${isPositive ? "text-success" : "text-destructive"}`}>
              {formatCurrency(projecao.saldoProjetado)}
            </span>
          </div>
          {!isPositive && (
            <p className="text-xs text-destructive mt-2">
              Atenção: Projeção indica saldo negativo no fim do mês
            </p>
          )}
        </div>

        {/* Pending Transactions List */}
        <div>
          <h4 className="text-sm font-medium mb-2">Transações Pendentes ({projecao.pendentes.length})</h4>
          <ScrollArea className="h-[180px]">
            <div className="space-y-2">
              {projecao.pendentes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma transação pendente
                </p>
              ) : (
                projecao.pendentes.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {t.descricao || "Sem descrição"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(t.data), "dd/MM", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={t.tipo === "receita" ? "default" : "destructive"}
                        className={t.tipo === "receita" ? "bg-success/10 text-success hover:bg-success/20" : ""}
                      >
                        {t.tipo === "receita" ? "+" : "-"}{formatCurrency(Number(t.valor))}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
