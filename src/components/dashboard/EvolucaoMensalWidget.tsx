import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo } from "react";

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  is_pago_executado: boolean | null;
  forma_pagamento: string;
}

interface EvolucaoMensalWidgetProps {
  transacoes: Transacao[];
}

export function EvolucaoMensalWidget({ transacoes }: EvolucaoMensalWidgetProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const dadosMensais = useMemo(() => {
    const hoje = new Date();
    const meses: Array<{ mes: string; mesLabel: string; receitas: number; despesas: number }> = [];

    // Generate last 6 months
    for (let i = 5; i >= 0; i--) {
      const data = subMonths(hoje, i);
      const inicio = startOfMonth(data);
      const fim = endOfMonth(data);
      const mesKey = format(data, "yyyy-MM");
      const mesLabel = format(data, "MMM/yy", { locale: ptBR });

      meses.push({ mes: mesKey, mesLabel, receitas: 0, despesas: 0 });
    }

    // Filter valid transactions: exclude transfers and non-executed payments
    const transacoesValidas = transacoes.filter(t => 
      t.forma_pagamento !== "transferencia" && 
      t.is_pago_executado !== false
    );

    // Aggregate by month
    transacoesValidas.forEach(t => {
      const transacaoDate = parseISO(t.data);
      const mesKey = format(transacaoDate, "yyyy-MM");
      const mesData = meses.find(m => m.mes === mesKey);
      
      if (mesData) {
        if (t.tipo === "receita") {
          mesData.receitas += Number(t.valor);
        } else if (t.tipo === "despesa") {
          mesData.despesas += Number(t.valor);
        }
      }
    });

    return meses;
  }, [transacoes]);

  const hasData = dadosMensais.some(m => m.receitas > 0 || m.despesas > 0);

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Evolução Mensal</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dadosMensais} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis 
                dataKey="mesLabel" 
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis 
                tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label) => `Mês: ${label}`}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar 
                dataKey="receitas" 
                name="Receitas" 
                fill="hsl(var(--success))" 
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                dataKey="despesas" 
                name="Despesas" 
                fill="hsl(var(--destructive))" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            Sem dados para exibir
          </div>
        )}
      </CardContent>
    </Card>
  );
}
