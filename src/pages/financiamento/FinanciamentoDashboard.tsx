import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatsCards from "@/components/StatsCards";
import DashboardCharts from "@/components/DashboardCharts";
import ExportButton from "@/components/ExportButton";
import { RefreshCw, Car, Plus } from "lucide-react";

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

const FinanciamentoDashboard = () => {
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

    const { data: contratos } = await supabase
      .from("financiamento")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: true });

    const list = (contratos || []) as Financiamento[];
    setFinanciamentos(list);

    if (list.length > 0) {
      setSelectedId((prev) => (prev && list.some((item) => item.id === prev) ? prev : list[0].id));

      const { data: parcelasData } = await supabase
        .from("parcelas")
        .select("*")
        .in("financiamento_id", list.map((item) => item.id))
        .order("numero_parcela", { ascending: true });

      const grouped = (parcelasData || []).reduce<Record<string, Parcela[]>>((acc, item: any) => {
        if (!acc[item.financiamento_id]) acc[item.financiamento_id] = [];
        acc[item.financiamento_id].push(item);
        return acc;
      }, {});

      setParcelasByContrato(grouped);
    }

    setLoading(false);
  };

  const selectedContrato = useMemo(
    () => financiamentos.find((item) => item.id === selectedId) || null,
    [financiamentos, selectedId]
  );
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
            <Car className="h-8 w-8 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Nenhum contrato encontrado</h2>
          <p className="text-muted-foreground text-center max-w-md">Configure um contrato primeiro para visualizar relatórios.</p>
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
  const totalAmortizacao = parcelasPagas.reduce((acc, p) => acc + (Number(p.amortizacao) || 0), 0);
  const saldoDevedor = parcelas.filter((p) => !p.pago).reduce((acc, p) => acc + Number(p.valor_parcela), 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Relatórios e Análises</h1>
              <p className="text-muted-foreground">Visão específica por contrato selecionado.</p>
            </div>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Selecione um contrato" />
              </SelectTrigger>
              <SelectContent>
                {financiamentos.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {(item.icone || "📄") + " " + item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <ExportButton parcelas={parcelas} financiamento={selectedContrato} />
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
          valorFinanciado={selectedContrato.valor_financiado}
        />

        <DashboardCharts parcelas={parcelas} valorFinanciado={selectedContrato.valor_financiado} />
      </div>
    </AppLayout>
  );
};

export default FinanciamentoDashboard;
