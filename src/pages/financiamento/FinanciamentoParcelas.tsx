import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatsCards from "@/components/StatsCards";
import InstallmentsTable from "@/components/InstallmentsTable";
import ExportButton from "@/components/ExportButton";
import { Landmark, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type TipoContrato = "financiamento" | "emprestimo";

interface Financiamento {
  id: string;
  nome: string;
  tipo: TipoContrato;
  icone: string | null;
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

const FinanciamentoParcelas = () => {
  const { user } = useAuth();
  const [financiamentos, setFinanciamentos] = useState<Financiamento[]>([]);
  const [parcelasByContrato, setParcelasByContrato] = useState<Record<string, Parcela[]>>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);

    const { data: contratos, error } = await supabase
      .from("financiamento")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Erro", description: "Erro ao carregar contratos", variant: "destructive" });
      setLoading(false);
      return;
    }

    const list = (contratos || []) as Financiamento[];
    setFinanciamentos(list);

    if (list.length > 0) {
      setSelectedId((prev) => (prev && list.some((item) => item.id === prev) ? prev : list[0].id));
      const ids = list.map((item) => item.id);

      const { data: parcelasData, error: parcelasError } = await supabase
        .from("parcelas")
        .select("*")
        .in("financiamento_id", ids)
        .order("numero_parcela", { ascending: true });

      if (parcelasError) {
        toast({ title: "Erro", description: "Erro ao carregar parcelas", variant: "destructive" });
      } else {
        const grouped = (parcelasData || []).reduce<Record<string, Parcela[]>>((acc, item: any) => {
          if (!acc[item.financiamento_id]) acc[item.financiamento_id] = [];
          acc[item.financiamento_id].push(item);
          return acc;
        }, {});
        setParcelasByContrato(grouped);
      }
    }

    setLoading(false);
  };

  const selectedContrato = useMemo(() => financiamentos.find((item) => item.id === selectedId) || null, [financiamentos, selectedId]);
  const parcelas = selectedId ? parcelasByContrato[selectedId] || [] : [];


  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  if (!selectedContrato) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-soft">
            <Landmark className="h-8 w-8 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Nenhum contrato encontrado</h2>
          <p className="text-muted-foreground text-center max-w-md">Configure um contrato primeiro para visualizar as parcelas.</p>
          <Button asChild className="gradient-primary text-primary-foreground">
            <Link to="/financiamento">
              <Plus className="h-4 w-4 mr-2" />
              Configurar Contratos
            </Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const parcelasPagas = parcelas.filter((p) => p.pago);
  const totalPago = parcelasPagas.reduce((acc, p) => acc + (Number(p.valor_pago) || Number(p.valor_parcela)), 0);
  const totalEconomia = parcelasPagas.reduce((acc, p) => acc + (Number(p.economia) || 0), 0);
  const saldoDevedor = parcelas.filter((p) => !p.pago).reduce((acc, p) => acc + Number(p.valor_parcela), 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <Tabs value={selectedId} onValueChange={setSelectedId}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="w-full sm:w-auto overflow-x-auto">
              {financiamentos.map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {(item.icone || "📄") + " " + item.nome}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex flex-wrap gap-2">
              <ExportButton parcelas={parcelas} financiamento={selectedContrato} />
            </div>
          </div>

          {financiamentos.map((item) => {
            const currentParcelas = parcelasByContrato[item.id] || [];
            const currentPagas = currentParcelas.filter((p) => p.pago);
            const currentPago = currentPagas.reduce((acc, p) => acc + (Number(p.valor_pago) || Number(p.valor_parcela)), 0);
            const currentEconomia = currentPagas.reduce((acc, p) => acc + (Number(p.economia) || 0), 0);
            const currentSaldo = currentParcelas.filter((p) => !p.pago).reduce((acc, p) => acc + Number(p.valor_parcela), 0);

            return (
              <TabsContent key={item.id} value={item.id} className="space-y-6 mt-4">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Parcelas • {(item.icone || "📄") + " " + item.nome}</h1>
                  <p className="text-muted-foreground">{currentPagas.length} de {currentParcelas.length} parcelas pagas</p>
                </div>

                <StatsCards
                  parcelasPagas={currentPagas.length}
                  totalParcelas={currentParcelas.length}
                  totalPago={currentPago}
                  totalEconomia={currentEconomia}
                  totalAmortizacao={currentPagas.reduce((acc, p) => acc + (Number(p.amortizacao) || 0), 0)}
                  saldoDevedor={currentSaldo}
                  valorFinanciado={item.valor_financiado}
                />

                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="text-base">Todas as Parcelas</CardTitle>
                    <CardDescription>Clique em uma parcela para registrar pagamento</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <InstallmentsTable parcelas={currentParcelas} taxaDiaria={item.taxa_diaria} onUpdate={fetchData} />
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default FinanciamentoParcelas;
