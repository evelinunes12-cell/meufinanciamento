import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import Header from "@/components/Header";
import InstallmentsTable from "@/components/InstallmentsTable";
import StatsCards from "@/components/StatsCards";
import ExportButton from "@/components/ExportButton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { calcularSaldoDevedor } from "@/lib/calculations";
import { useAuth } from "@/hooks/useAuth";

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
  const { user } = useAuth();
  const [financiamento, setFinanciamento] = useState<Financiamento | null>(null);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    
    setIsLoading(true);

    const { data: financiamentoData } = await supabase
      .from("financiamento")
      .select("*")
      .eq("user_id", user.id)
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

  const handleRecalcular = async () => {
    if (!financiamento) return;

    setIsResetting(true);

    try {
      // Reset all parcelas to unpaid
      const { error } = await supabase
        .from("parcelas")
        .update({
          pago: false,
          data_pagamento: null,
          antecipada: false,
          valor_pago: null,
          amortizacao: null,
          juros: null,
          economia: null,
          dias_antecedencia: 0,
        })
        .eq("financiamento_id", financiamento.id);

      if (error) throw error;

      toast({
        title: "Parcelas recalculadas",
        description: "Todas as parcelas foram resetadas. Você pode alterar as taxas na página de configuração.",
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

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
  const totalAmortizacao = parcelas.reduce((sum, p) => sum + (p.amortizacao || 0), 0);
  const saldoDevedor = calcularSaldoDevedor(financiamento.valor_financiado, parcelas);

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
          <div className="flex flex-wrap gap-2">
            <ExportButton
              parcelas={parcelas}
              financiamento={financiamento}
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isResetting}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Recalcular
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Recalcular Financiamento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação irá resetar todas as parcelas como não pagas.
                    Você poderá então atualizar as taxas na página de configuração
                    e registrar os pagamentos novamente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRecalcular}>
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8">
          <StatsCards
            totalParcelas={parcelas.length}
            parcelasPagas={parcelasPagas}
            totalPago={totalPago}
            totalEconomia={totalEconomia}
            totalAmortizacao={totalAmortizacao}
            saldoDevedor={saldoDevedor}
            valorFinanciado={financiamento.valor_financiado}
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
