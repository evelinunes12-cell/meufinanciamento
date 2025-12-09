import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatsCards from "@/components/StatsCards";
import DashboardCharts from "@/components/DashboardCharts";
import ExportButton from "@/components/ExportButton";
import { RefreshCw, Car, Plus } from "lucide-react";

interface Financiamento {
  id: string;
  valor_financiado: number;
  valor_parcela: number;
  numero_parcelas: number;
  taxa_diaria: number;
  taxa_mensal: number;
  data_primeira_parcela: string;
}

interface Parcela {
  id: string;
  numero_parcela: number;
  data_vencimento: string;
  valor_parcela: number;
  pago: boolean;
  data_pagamento: string | null;
  antecipada: boolean;
  valor_pago: number | null;
  economia: number | null;
  dias_antecedencia: number | null;
  amortizacao: number | null;
  juros: number | null;
}

const FinanciamentoDashboard = () => {
  const { user } = useAuth();
  const [financiamento, setFinanciamento] = useState<Financiamento | null>(null);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);

    const { data: financiamentoData } = await supabase
      .from("financiamento")
      .select("*")
      .eq("user_id", user?.id)
      .maybeSingle();

    if (financiamentoData) {
      setFinanciamento(financiamentoData);

      const { data: parcelasData } = await supabase
        .from("parcelas")
        .select("*")
        .eq("financiamento_id", financiamentoData.id)
        .order("numero_parcela", { ascending: true });

      if (parcelasData) {
        setParcelas(parcelasData);
      }
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  if (!financiamento) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-soft">
            <Car className="h-8 w-8 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">
            Nenhum financiamento encontrado
          </h2>
          <p className="text-muted-foreground text-center max-w-md">
            Configure um financiamento primeiro para visualizar o dashboard.
          </p>
          <Button asChild className="gradient-primary text-primary-foreground">
            <Link to="/financiamento">
              <Plus className="h-4 w-4 mr-2" />
              Configurar Financiamento
            </Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const parcelasPagas = parcelas.filter((p) => p.pago);
  const totalPago = parcelasPagas.reduce(
    (acc, p) => acc + (Number(p.valor_pago) || Number(p.valor_parcela)),
    0
  );
  const totalEconomia = parcelasPagas.reduce(
    (acc, p) => acc + (Number(p.economia) || 0),
    0
  );
  const totalAmortizacao = parcelasPagas.reduce(
    (acc, p) => acc + (Number(p.amortizacao) || 0),
    0
  );
  const saldoDevedor = parcelas
    .filter((p) => !p.pago)
    .reduce((acc, p) => acc + Number(p.valor_parcela), 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard do Financiamento</h1>
            <p className="text-muted-foreground">
              Acompanhe a evolução do seu financiamento
            </p>
          </div>
          <div className="flex gap-2">
            <ExportButton parcelas={parcelas} financiamento={financiamento} />
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>

        <StatsCards
          parcelasPagas={parcelasPagas.length}
          totalParcelas={parcelas.length}
          totalPago={totalPago}
          totalEconomia={totalEconomia}
          totalAmortizacao={totalAmortizacao}
          saldoDevedor={saldoDevedor}
          valorFinanciado={financiamento.valor_financiado}
        />

        <DashboardCharts parcelas={parcelas} valorFinanciado={financiamento.valor_financiado} />
      </div>
    </AppLayout>
  );
};

export default FinanciamentoDashboard;
