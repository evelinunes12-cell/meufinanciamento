import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Calendar, AlertTriangle, Banknote } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import PagarFaturaModal from "@/components/PagarFaturaModal";

interface Conta {
  id: string;
  nome_conta: string;
  cor: string;
  tipo: string;
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

async function fetchCartoesData(userId: string | undefined) {
  if (!userId) return null;

  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);

  const [cartoesRes, transacoesRes, contasRes] = await Promise.all([
    supabase.from("contas").select("*").eq("tipo", "credito"),
    supabase
      .from("transacoes")
      .select("*")
      .gte("data", format(start, "yyyy-MM-dd"))
      .lte("data", format(end, "yyyy-MM-dd")),
    supabase.from("contas").select("*"),
  ]);

  return {
    cartoes: (cartoesRes.data || []) as Conta[],
    transacoes: (transacoesRes.data || []) as Transacao[],
    todasContas: (contasRes.data || []) as Conta[],
  };
}

const Cartoes = () => {
  const { user } = useAuth();
  const [faturaModal, setFaturaModal] = useState<{
    open: boolean;
    cartaoId: string;
    cartaoNome: string;
    valorFatura: number;
  }>({ open: false, cartaoId: "", cartaoNome: "", valorFatura: 0 });

  const { data, isLoading } = useQuery({
    queryKey: ["cartoes", user?.id],
    queryFn: () => fetchCartoesData(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const cartoes = data?.cartoes || [];
  const transacoes = data?.transacoes || [];
  const todasContas = data?.todasContas || [];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const getGastosCartao = (cartaoId: string) => {
    // Calculate: expenses - incomes (invoices paid are income to the card)
    const despesas = transacoes
      .filter(t => t.conta_id === cartaoId && t.tipo === "despesa")
      .reduce((acc, t) => acc + Number(t.valor), 0);
    
    const receitas = transacoes
      .filter(t => t.conta_id === cartaoId && t.tipo === "receita")
      .reduce((acc, t) => acc + Number(t.valor), 0);

    return despesas - receitas;
  };

  const handlePagarFatura = (cartao: Conta) => {
    const valorFatura = getGastosCartao(cartao.id);
    setFaturaModal({
      open: true,
      cartaoId: cartao.id,
      cartaoNome: cartao.nome_conta,
      valorFatura: Math.max(0, valorFatura),
    });
  };

  if (isLoading) {
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
              const percentualUsado = limite > 0 ? (Math.max(0, gastos) / limite) * 100 : 0;
              const disponivel = limite - Math.max(0, gastos);

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
                        <span className="font-medium text-foreground">
                          {formatCurrency(Math.max(0, gastos))}
                        </span>
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

                    {/* Pay Invoice Button */}
                    {gastos > 0 && (
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => handlePagarFatura(cartao)}
                      >
                        <Banknote className="h-4 w-4" />
                        Pagar Fatura
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <PagarFaturaModal
        open={faturaModal.open}
        onOpenChange={(open) => setFaturaModal((prev) => ({ ...prev, open }))}
        cartaoId={faturaModal.cartaoId}
        cartaoNome={faturaModal.cartaoNome}
        valorFatura={faturaModal.valorFatura}
        contasDisponiveis={todasContas}
      />
    </AppLayout>
  );
};

export default Cartoes;
