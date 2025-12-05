import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import Header from "@/components/Header";
import InstallmentsTable from "@/components/InstallmentsTable";
import StatsCards from "@/components/StatsCards";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

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
  amortizacao: number | null;
  juros: number | null;
  economia: number | null;
  dias_antecedencia: number | null;
}

const Parcelas = () => {
  const navigate = useNavigate();
  const [financiamento, setFinanciamento] = useState<Financiamento | null>(null);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);

    const { data: financiamentoData } = await supabase
      .from("financiamento")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (financiamentoData) {
      setFinanciamento(financiamentoData);

      const { data: parcelasData } = await supabase
        .from("parcelas")
        .select("*")
        .eq("financiamento_id", financiamentoData.id)
        .order("numero_parcela");

      setParcelas(parcelasData || []);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto flex items-center justify-center px-4 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (!financiamento) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="mx-auto max-w-md">
            <Alert className="border-warning/50 bg-warning/10">
              <AlertCircle className="h-4 w-4 text-warning" />
              <AlertTitle>Nenhum financiamento encontrado</AlertTitle>
              <AlertDescription className="mt-2">
                Você ainda não cadastrou um financiamento. Cadastre para visualizar
                suas parcelas.
              </AlertDescription>
            </Alert>
            <Button
              className="mt-4 w-full"
              variant="hero"
              onClick={() => navigate("/")}
            >
              Cadastrar Financiamento
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const parcelasPagas = parcelas.filter((p) => p.pago).length;
  const totalPago = parcelas.reduce((sum, p) => sum + (p.valor_pago || 0), 0);
  const totalEconomia = parcelas.reduce((sum, p) => sum + (p.economia || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Minhas Parcelas</h1>
            <p className="text-muted-foreground">
              Acompanhe e gerencie as parcelas do seu financiamento
            </p>
          </div>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="mb-8">
          <StatsCards
            totalParcelas={parcelas.length}
            parcelasPagas={parcelasPagas}
            totalPago={totalPago}
            totalEconomia={totalEconomia}
          />
        </div>

        {/* Financing Info */}
        <div className="mb-6 rounded-xl border border-border/50 bg-card p-4 shadow-card animate-slide-up">
          <div className="grid gap-4 text-sm sm:grid-cols-4">
            <div>
              <span className="text-muted-foreground">Valor Financiado:</span>
              <p className="font-semibold">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(financiamento.valor_financiado)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Valor da Parcela:</span>
              <p className="font-semibold">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(financiamento.valor_parcela)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Taxa Diária:</span>
              <p className="font-semibold">
                {(financiamento.taxa_diaria * 100).toFixed(4)}%
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Taxa Mensal:</span>
              <p className="font-semibold">
                {(financiamento.taxa_mensal * 100).toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="animate-slide-up" style={{ animationDelay: "100ms" }}>
          <InstallmentsTable
            parcelas={parcelas}
            taxaDiaria={financiamento.taxa_diaria}
            onUpdate={fetchData}
          />
        </div>
      </main>
    </div>
  );
};

export default Parcelas;
