import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/calculations";

interface Parcela {
  id: string;
  numero_parcela: number;
  data_vencimento: string;
  valor_parcela: number;
  pago: boolean;
  data_pagamento: string | null;
  antecipada: boolean;
  valor_pago: number | null;
  amortizacao: number | null;
  juros: number | null;
  economia: number | null;
  dias_antecedencia: number | null;
}

interface DashboardChartsProps {
  parcelas: Parcela[];
  valorFinanciado: number;
}

const COLORS = {
  primary: "hsl(158, 64%, 35%)",
  success: "hsl(142, 76%, 36%)",
  warning: "hsl(38, 92%, 50%)",
  muted: "hsl(150, 15%, 70%)",
};

const DashboardCharts = ({ parcelas, valorFinanciado }: DashboardChartsProps) => {
  // Dados para gráfico de evolução do saldo devedor
  const saldoDevedorData = useMemo(() => {
    const parcelasPagas = parcelas.filter((p) => p.pago && p.data_pagamento);
    const sorted = [...parcelasPagas].sort(
      (a, b) => new Date(a.data_pagamento!).getTime() - new Date(b.data_pagamento!).getTime()
    );

    let saldoAtual = valorFinanciado;
    const data = [{ mes: "Início", saldo: valorFinanciado, amortizacaoAcum: 0 }];
    let amortizacaoAcumulada = 0;

    sorted.forEach((p) => {
      saldoAtual -= p.amortizacao || 0;
      amortizacaoAcumulada += p.amortizacao || 0;
      data.push({
        mes: format(parseISO(p.data_pagamento!), "MMM/yy", { locale: ptBR }),
        saldo: Math.max(0, saldoAtual),
        amortizacaoAcum: amortizacaoAcumulada,
      });
    });

    return data;
  }, [parcelas, valorFinanciado]);

  // Dados para gráfico de pizza (normais vs antecipadas)
  const distribuicaoData = useMemo(() => {
    const pagas = parcelas.filter((p) => p.pago);
    const antecipadas = pagas.filter((p) => p.antecipada).length;
    const normais = pagas.length - antecipadas;

    return [
      { name: "Antecipadas", value: antecipadas, color: COLORS.success },
      { name: "Normais", value: normais, color: COLORS.primary },
    ];
  }, [parcelas]);

  // Dados para gráfico de barras (economia por mês)
  const economiaData = useMemo(() => {
    const parcelasComEconomia = parcelas.filter(
      (p) => p.pago && p.economia && p.economia > 0 && p.data_pagamento
    );

    const porMes: Record<string, number> = {};

    parcelasComEconomia.forEach((p) => {
      const mes = format(parseISO(p.data_pagamento!), "MMM/yy", { locale: ptBR });
      porMes[mes] = (porMes[mes] || 0) + (p.economia || 0);
    });

    return Object.entries(porMes).map(([mes, economia]) => ({
      mes,
      economia,
    }));
  }, [parcelas]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const totalPagas = parcelas.filter((p) => p.pago).length;

  if (totalPagas === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Nenhum pagamento registrado ainda.</p>
        <p className="text-sm">Os gráficos aparecerão após o primeiro pagamento.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Evolução do Saldo Devedor */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Evolução do Saldo Devedor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={saldoDevedorData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="saldo"
                  name="Saldo Devedor"
                  stroke={COLORS.primary}
                  strokeWidth={3}
                  dot={{ fill: COLORS.primary, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Distribuição de Pagamentos */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Distribuição de Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribuicaoData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {distribuicaoData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Economia por Mês */}
      {economiaData.length > 0 && (
        <Card className="shadow-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Economia Gerada por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={economiaData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    tickFormatter={(value) => `R$${value}`}
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="economia" name="Economia" fill={COLORS.success} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Amortização Acumulada */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Amortização Acumulada</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={saldoDevedorData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="amortizacaoAcum"
                  name="Amortização Acumulada"
                  stroke={COLORS.success}
                  strokeWidth={3}
                  dot={{ fill: COLORS.success, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardCharts;
