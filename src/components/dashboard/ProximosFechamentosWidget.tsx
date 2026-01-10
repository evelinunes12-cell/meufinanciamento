import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreditCard, Calendar, AlertTriangle } from "lucide-react";
import { format, addMonths, setDate, isBefore, differenceInDays, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo } from "react";

interface Conta {
  id: string;
  nome_conta: string;
  tipo: string;
  cor: string;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  conta_id: string;
  data: string;
  is_pago_executado: boolean | null;
}

interface ProximosFechamentosWidgetProps {
  contas: Conta[];
  transacoes: Transacao[];
}

export function ProximosFechamentosWidget({ contas, transacoes }: ProximosFechamentosWidgetProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const cartoesComFechamento = useMemo(() => {
    const hoje = new Date();
    const cartoesCredito = contas.filter(c => c.tipo === "credito" && c.dia_fechamento && c.dia_vencimento);

    return cartoesCredito.map(cartao => {
      const diaFechamento = cartao.dia_fechamento!;
      const diaVencimento = cartao.dia_vencimento!;

      // Calculate next closing date
      let proximoFechamento = setDate(hoje, diaFechamento);
      if (isBefore(proximoFechamento, hoje)) {
        proximoFechamento = addMonths(proximoFechamento, 1);
      }

      // Calculate due date (always after closing)
      let proximoVencimento = setDate(proximoFechamento, diaVencimento);
      if (diaVencimento <= diaFechamento) {
        proximoVencimento = addMonths(proximoVencimento, 1);
      }

      // Calculate current invoice period
      const inicioFatura = addMonths(setDate(startOfMonth(proximoFechamento), diaFechamento), -1);
      const fimFatura = proximoFechamento;

      // Sum expenses in current invoice period
      const gastosFatura = transacoes
        .filter(t => {
          if (t.conta_id !== cartao.id || t.tipo !== "despesa") return false;
          const dataTransacao = parseISO(t.data);
          return !isBefore(dataTransacao, inicioFatura) && isBefore(dataTransacao, fimFatura);
        })
        .reduce((acc, t) => acc + Number(t.valor), 0);

      const diasParaFechamento = differenceInDays(proximoFechamento, hoje);
      const diasParaVencimento = differenceInDays(proximoVencimento, hoje);

      return {
        ...cartao,
        proximoFechamento,
        proximoVencimento,
        diasParaFechamento,
        diasParaVencimento,
        gastosFatura,
        urgente: diasParaFechamento <= 5,
      };
    }).sort((a, b) => a.diasParaFechamento - b.diasParaFechamento);
  }, [contas, transacoes]);

  if (cartoesComFechamento.length === 0) {
    return null;
  }

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Próximos Fechamentos de Fatura
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[280px]">
          <div className="space-y-3">
            {cartoesComFechamento.map((cartao) => (
              <div
                key={cartao.id}
                className={`p-4 rounded-lg border transition-colors ${
                  cartao.urgente 
                    ? "bg-warning/10 border-warning/30" 
                    : "bg-muted/50 border-border/50"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: cartao.cor }}
                    />
                    <span className="font-medium text-sm">{cartao.nome_conta}</span>
                    {cartao.urgente && (
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    )}
                  </div>
                  <Badge 
                    variant={cartao.urgente ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {cartao.diasParaFechamento === 0 
                      ? "Fecha hoje!" 
                      : `${cartao.diasParaFechamento} dias`}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Fechamento</p>
                      <p className="font-medium">
                        {format(cartao.proximoFechamento, "dd/MM", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Vencimento</p>
                      <p className="font-medium">
                        {format(cartao.proximoVencimento, "dd/MM", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Fatura Parcial</span>
                    <span className="text-sm font-bold text-destructive">
                      {formatCurrency(cartao.gastosFatura)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
