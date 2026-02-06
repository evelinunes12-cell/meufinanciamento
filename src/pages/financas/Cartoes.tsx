import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Calendar, AlertTriangle, Banknote } from "lucide-react";
import { format, parseISO, subMonths, addMonths } from "date-fns";
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
  is_pago_executado: boolean | null;
}

// Calculate the invoice period for a credit card based on closing day
function getInvoicePeriod(diaFechamento: number | null, referenceDate: Date = new Date()) {
  const closingDay = diaFechamento || 1;
  const today = referenceDate;
  const currentDay = today.getDate();
  
  let closingDate: Date;
  let startDate: Date;
  
  // If we're past the closing day, we're in the next invoice period
  if (currentDay > closingDay) {
    // Invoice closes this month, so it covers from last month's closing day + 1 to this month's closing day
    closingDate = new Date(today.getFullYear(), today.getMonth(), closingDay);
    startDate = new Date(today.getFullYear(), today.getMonth() - 1, closingDay + 1);
  } else {
    // We're before the closing day, so current invoice started last month
    closingDate = new Date(today.getFullYear(), today.getMonth(), closingDay);
    startDate = new Date(today.getFullYear(), today.getMonth() - 1, closingDay + 1);
  }
  
  return {
    startDate: format(startDate, "yyyy-MM-dd"),
    endDate: format(closingDate, "yyyy-MM-dd"),
    closingDate,
  };
}

// Get the closed invoice period (the one that's ready to be paid)
function getClosedInvoicePeriod(diaFechamento: number | null, referenceDate: Date = new Date()) {
  const closingDay = diaFechamento || 1;
  const today = referenceDate;
  const currentDay = today.getDate();
  
  let closingDate: Date;
  let startDate: Date;
  
  // If we're past the closing day, the closed invoice is from the previous cycle
  if (currentDay > closingDay) {
    // Closed invoice: from 2 months ago closing day + 1 to last month's closing day
    closingDate = new Date(today.getFullYear(), today.getMonth(), closingDay);
    startDate = new Date(today.getFullYear(), today.getMonth() - 1, closingDay + 1);
  } else {
    // We're before closing day, so closed invoice is from last cycle
    closingDate = new Date(today.getFullYear(), today.getMonth() - 1, closingDay);
    startDate = new Date(today.getFullYear(), today.getMonth() - 2, closingDay + 1);
  }
  
  return {
    startDate: format(startDate, "yyyy-MM-dd"),
    endDate: format(closingDate, "yyyy-MM-dd"),
    closingDate,
  };
}

async function fetchCartoesData(userId: string | undefined) {
  if (!userId) return null;

  // Fetch all credit card transactions (we'll filter by period on client side)
  const [cartoesRes, transacoesRes, contasRes] = await Promise.all([
    supabase.from("contas").select("*").eq("tipo", "credito"),
    supabase
      .from("transacoes")
      .select("*")
      .eq("tipo", "despesa"),
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

  // Get expenses for the closed invoice (ready to be paid)
  const getFaturaFechada = (cartao: Conta) => {
    const { startDate, endDate } = getClosedInvoicePeriod(cartao.dia_fechamento);
    
    return transacoes
      .filter(t => {
        if (t.conta_id !== cartao.id) return false;
        const transactionDate = t.data;
        return transactionDate >= startDate && transactionDate <= endDate && t.is_pago_executado !== true;
      })
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  // Get expenses for the current open invoice
  const getFaturaAberta = (cartao: Conta) => {
    const { startDate, endDate } = getInvoicePeriod(cartao.dia_fechamento);
    
    return transacoes
      .filter(t => {
        if (t.conta_id !== cartao.id) return false;
        const transactionDate = t.data;
        return transactionDate >= startDate && transactionDate <= endDate;
      })
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  // Total unpaid balance on the card (all unpaid transactions)
  const getSaldoDevedor = (cartaoId: string) => {
    return transacoes
      .filter(t => t.conta_id === cartaoId && t.is_pago_executado !== true)
      .reduce((acc, t) => acc + Number(t.valor), 0);
  };

  const handlePagarFatura = (cartao: Conta) => {
    const valorFatura = getFaturaFechada(cartao);
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
              const faturaFechada = getFaturaFechada(cartao);
              const faturaAberta = getFaturaAberta(cartao);
              const saldoDevedor = getSaldoDevedor(cartao.id);
              const limite = Number(cartao.limite) || 0;
              const percentualUsado = limite > 0 ? (Math.max(0, saldoDevedor) / limite) * 100 : 0;
              const disponivel = limite - Math.max(0, saldoDevedor);
              
              const { closingDate } = getClosedInvoicePeriod(cartao.dia_fechamento);
              const mesReferencia = format(closingDate, "MMMM/yyyy", { locale: ptBR });

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
                    {/* Closed Invoice - Ready to Pay */}
                    {faturaFechada > 0 && (
                      <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-xs text-muted-foreground">Fatura Fechada ({mesReferencia})</p>
                            <p className="text-lg font-bold text-warning">{formatCurrency(faturaFechada)}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 border-warning text-warning hover:bg-warning hover:text-warning-foreground"
                            onClick={() => handlePagarFatura(cartao)}
                          >
                            <Banknote className="h-4 w-4" />
                            Pagar
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Current Open Invoice */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Fatura Atual (em aberto)</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(faturaAberta)}
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
                        <p className="text-xs text-muted-foreground">Saldo Devedor Total</p>
                        <p className="text-lg font-bold text-foreground">{formatCurrency(saldoDevedor)}</p>
                      </div>
                    </div>
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