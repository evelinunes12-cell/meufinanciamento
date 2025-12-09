import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import FinancingForm from "@/components/FinancingForm";
import { Car, Calendar, Percent, Hash, DollarSign, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Financiamento {
  id: string;
  valor_financiado: number;
  valor_parcela: number;
  numero_parcelas: number;
  taxa_diaria: number;
  taxa_mensal: number;
  data_primeira_parcela: string;
  data_contratacao: string | null;
}

const FinanciamentoConfig = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [financiamento, setFinanciamento] = useState<Financiamento | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchFinanciamento();
    }
  }, [user]);

  const fetchFinanciamento = async () => {
    const { data } = await supabase
      .from("financiamento")
      .select("*")
      .eq("user_id", user?.id)
      .maybeSingle();

    setFinanciamento(data);
    setLoading(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return (value * 100).toFixed(4) + "%";
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

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financiamento Veicular</h1>
          <p className="text-muted-foreground">
            Configure os dados do seu financiamento
          </p>
        </div>

        {financiamento ? (
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="shadow-card md:col-span-2">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary shadow-soft">
                    <Car className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <CardTitle>Resumo do Financiamento</CardTitle>
                    <CardDescription>
                      Contratado em{" "}
                      {financiamento.data_contratacao
                        ? format(new Date(financiamento.data_contratacao), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                        : "data não informada"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-xs">Valor Financiado</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {formatCurrency(Number(financiamento.valor_financiado))}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-xs">Valor da Parcela</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {formatCurrency(Number(financiamento.valor_parcela))}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Hash className="h-4 w-4" />
                      <span className="text-xs">Nº de Parcelas</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {financiamento.numero_parcelas}x
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Calendar className="h-4 w-4" />
                      <span className="text-xs">1ª Parcela</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {format(new Date(financiamento.data_primeira_parcela), "dd/MM/yyyy")}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Percent className="h-4 w-4" />
                      <span className="text-xs">Taxa Diária</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {formatPercent(Number(financiamento.taxa_diaria))}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Percent className="h-4 w-4" />
                      <span className="text-xs">Taxa Mensal</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {formatPercent(Number(financiamento.taxa_mensal))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Alterar Dados do Financiamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FinancingForm />
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="shadow-card">
            <CardHeader className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-soft mb-4">
                <Car className="h-8 w-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-xl">Configure seu Financiamento</CardTitle>
              <CardDescription>
                Insira os dados do seu financiamento para começar a acompanhar suas parcelas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FinancingForm />
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default FinanciamentoConfig;
