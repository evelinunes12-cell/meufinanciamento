import { Wallet, TrendingDown, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatsCardsProps {
  totalParcelas: number;
  parcelasPagas: number;
  totalPago: number;
  totalEconomia: number;
}

const StatsCards = ({
  totalParcelas,
  parcelasPagas,
  totalPago,
  totalEconomia,
}: StatsCardsProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const stats = [
    {
      title: "Parcelas Pagas",
      value: `${parcelasPagas}/${totalParcelas}`,
      icon: CheckCircle,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Parcelas Restantes",
      value: totalParcelas - parcelasPagas,
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Total Pago",
      value: formatCurrency(totalPago),
      icon: Wallet,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Total Economizado",
      value: formatCurrency(totalEconomia),
      icon: TrendingDown,
      color: "text-success",
      bgColor: "bg-success/10",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.title}
            className="animate-slide-up shadow-card border-border/50"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`rounded-xl p-3 ${stat.bgColor}`}>
                <Icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default StatsCards;
