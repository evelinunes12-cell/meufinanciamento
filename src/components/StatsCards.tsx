import { Wallet, TrendingDown, CheckCircle, Clock, PiggyBank, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/calculations";

interface StatsCardsProps {
  totalParcelas: number;
  parcelasPagas: number;
  totalPago: number;
  totalEconomia: number;
  totalAmortizacao: number;
  saldoDevedor: number;
  valorFinanciado: number;
}

const StatsCards = ({
  totalParcelas,
  parcelasPagas,
  totalPago,
  totalEconomia,
  totalAmortizacao,
  saldoDevedor,
  valorFinanciado,
}: StatsCardsProps) => {
  const percentualQuitado = valorFinanciado > 0 
    ? ((valorFinanciado - saldoDevedor) / valorFinanciado) * 100 
    : 0;

  const stats = [
    {
      title: "Parcelas Pagas",
      value: `${parcelasPagas}/${totalParcelas}`,
      subtitle: `${((parcelasPagas / totalParcelas) * 100).toFixed(0)}% concluído`,
      icon: CheckCircle,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Total Pago",
      value: formatCurrency(totalPago),
      subtitle: "Valor desembolsado",
      icon: Wallet,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Total Economizado",
      value: formatCurrency(totalEconomia),
      subtitle: "Com antecipações",
      icon: PiggyBank,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Total Amortizado",
      value: formatCurrency(totalAmortizacao),
      subtitle: "Abatido do principal",
      icon: TrendingDown,
      color: "text-accent-foreground",
      bgColor: "bg-accent",
    },
    {
      title: "Saldo Devedor",
      value: formatCurrency(saldoDevedor),
      subtitle: `${percentualQuitado.toFixed(1)}% quitado`,
      icon: Target,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Parcelas Restantes",
      value: totalParcelas - parcelasPagas,
      subtitle: "A pagar",
      icon: Clock,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.title}
            className="animate-slide-up shadow-card border-border/50"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={`rounded-lg p-2 ${stat.bgColor}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {stat.title}
                </p>
                <p className="text-xl font-bold mt-1">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default StatsCards;
