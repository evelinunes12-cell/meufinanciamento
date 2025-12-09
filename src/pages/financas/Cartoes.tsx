import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Calendar, AlertTriangle } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";

interface Conta {
  id: string;
  nome_conta: string;
  cor: string;
  limite: number | null;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}

interface Transacao {
  id: string;
  conta_id: string;
  valor: number;
  tipo: string;
  data: string;
}

const Cartoes = () => {
  const { user } = useAuth();
  const [cartoes, setCartoes] = useState<Conta[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);

    const [cartoesRes, transacoesRes] = await Promise.all([
      supabase.from("contas").select("*").eq("tipo", "credito"),
      supabase
        .from("transacoes")
        .select("*")
        .eq("tipo", "despesa")
        .gte("data", format(start, "yyyy-MM-dd"))
        .lte("data", format(end, "yyyy-MM-dd")),
    ]);

    if (cartoesRes.data) setCartoes(cartoesRes.data);
    if (transacoesRes.data) setTransacoes(transacoesRes.data);
    setLoading(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const getGastosCartao = (cartaoId: string) => {
    return transacoes
      .filter(t => t.conta_id === cartaoId)
      .reduce((acc, t) => acc + Number(t.valor), 0);
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
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cartões de Crédito</h1>
            <p className="text-muted-foreground">Acompanhe seus gastos e faturas</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/financas/contas">
              Gerenciar Cartões
            </Link>
          </Button>
        </div>

        {cartoes.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum cartão cadastrado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Cadastre seus cartões de crédito para acompanhar gastos e faturas
              </p>
              <Button asChild>
                <Link to="/financas/contas">Cadastrar Cartão</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cartoes.map((cartao) => {
              const gastos = getGastosCartao(cartao.id);
              const limite = Number(cartao.limite) || 0;
              const percentualUsado = limite > 0 ? (gastos / limite) * 100 : 0;
              const disponivel = limite - gastos;

              return (
                <Card key={cartao.id} className="shadow-card overflow-hidden">
                  <div className="h-2" style={{ backgroundColor: cartao.cor }} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${cartao.cor}20` }}
                        >
                          <CreditCard className="h-5 w-5" style={{ color: cartao.cor }} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{cartao.nome_conta}</CardTitle>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            Fecha dia {cartao.dia_fechamento} | Vence dia {cartao.dia_vencimento}
                          </div>
                        </div>
                      </div>
                      {percentualUsado > 80 && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Alto uso
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Fatura Atual</span>
                        <span className="font-medium text-foreground">{formatCurrency(gastos)}</span>
                      </div>
                      <Progress 
                        value={Math.min(percentualUsado, 100)} 
                        className="h-2"
                      />
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-muted-foreground">{percentualUsado.toFixed(1)}% usado</span>
                        <span className="text-muted-foreground">Limite: {formatCurrency(limite)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Disponível</p>
                        <p className={`text-lg font-bold ${disponivel >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(disponivel)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Limite Total</p>
                        <p className="text-lg font-bold text-foreground">{formatCurrency(limite)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Cartoes;
