import { ReactNode, useState, useMemo } from "react";
import AppSidebar from "./AppSidebar";
import QuickAddTransaction from "./QuickAddTransaction";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Wallet, AlertTriangle } from "lucide-react";
import { useSaldo } from "@/contexts/SaldoContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

interface AppLayoutProps {
  children: ReactNode;
}

interface Conta {
  id: string;
  nome_conta: string;
  saldo_inicial: number;
  tipo: string;
  cor: string;
}

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  conta_id: string;
  forma_pagamento: string;
  is_pago_executado: boolean | null;
  data: string;
}

const SALDO_MINIMO_ALERTA = 100; // Threshold for low balance alert

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const SaldoSkeleton = ({ size = "default" }: { size?: "compact" | "default" }) => {
  if (size === "compact") {
    return <Skeleton className="h-3 w-16" />;
  }
  return (
    <div className="text-right">
      <Skeleton className="h-2.5 w-12 mb-1 ml-auto" />
      <Skeleton className="h-4 w-20" />
    </div>
  );
};

const AppLayout = ({ children }: AppLayoutProps) => {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const { saldoContas, isLoading } = useSaldo();
  const { user } = useAuth();

  // Fetch individual account balances for alert
  const { data: contasData } = useQuery({
    queryKey: ["contas-saldo-alert", user?.id],
    queryFn: async () => {
      if (!user?.id) return { contas: [], transacoes: [] };
      
      const [contasRes, transacoesRes] = await Promise.all([
        supabase.from("contas").select("*"),
        supabase.from("transacoes").select("id, valor, tipo, conta_id, forma_pagamento, is_pago_executado, data"),
      ]);

      return {
        contas: (contasRes.data || []) as Conta[],
        transacoes: (transacoesRes.data || []) as Transacao[],
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate accounts with low balance and predicted balance
  const { contasBaixoSaldo, saldoPrevisto, totalPendente } = useMemo(() => {
    if (!contasData) return { contasBaixoSaldo: [], saldoPrevisto: 0, totalPendente: 0 };
    
    const { contas, transacoes } = contasData;
    const transacoesValidas = transacoes.filter(
      t => t.forma_pagamento !== "transferencia" && t.is_pago_executado !== false
    );

    // Calculate low balance accounts
    const contasBaixo = contas
      .filter(c => c.tipo !== "credito")
      .map(conta => {
        const transacoesConta = transacoesValidas.filter(t => t.conta_id === conta.id);
        const receitas = transacoesConta.filter(t => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
        const despesas = transacoesConta.filter(t => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
        const saldo = Number(conta.saldo_inicial) + receitas - despesas;
        return { ...conta, saldo };
      })
      .filter(c => c.saldo < SALDO_MINIMO_ALERTA);

    // Calculate pending transactions for current month (not executed yet)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const transacoesPendentes = transacoes.filter(t => {
      if (t.is_pago_executado !== false) return false;
      if (t.forma_pagamento === "transferencia") return false;
      const dataT = new Date(t.data);
      return dataT.getMonth() === currentMonth && dataT.getFullYear() === currentYear;
    });

    const receitasPendentes = transacoesPendentes
      .filter(t => t.tipo === "receita")
      .reduce((a, t) => a + Number(t.valor), 0);
    const despesasPendentes = transacoesPendentes
      .filter(t => t.tipo === "despesa")
      .reduce((a, t) => a + Number(t.valor), 0);

    const pendente = despesasPendentes - receitasPendentes;

    return { 
      contasBaixoSaldo: contasBaixo, 
      saldoPrevisto: 0, // Will be calculated using saldoContas
      totalPendente: pendente
    };
  }, [contasData]);

  const saldoPrevistoFinal = saldoContas - totalPendente;
  const hasLowBalanceAlert = contasBaixoSaldo.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      
      {/* Mobile Header Bar with saldo */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center justify-end h-full px-4 pr-16">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
                hasLowBalanceAlert 
                  ? "bg-destructive/10 border-destructive/50" 
                  : "bg-muted/80 border-border/50"
              }`}>
                {hasLowBalanceAlert ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                ) : (
                  <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                {isLoading ? (
                  <SaldoSkeleton size="compact" />
                ) : (
                  <div className="flex flex-col items-end">
                    <span className={`text-xs font-semibold whitespace-nowrap ${saldoContas >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(saldoContas)}
                    </span>
                    {totalPendente !== 0 && (
                      <span className={`text-[9px] whitespace-nowrap ${saldoPrevistoFinal >= 0 ? "text-muted-foreground" : "text-destructive"}`}>
                        Prev: {formatCurrency(saldoPrevistoFinal)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            {hasLowBalanceAlert && (
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Contas com saldo baixo:</p>
                  {contasBaixoSaldo.map(c => (
                    <p key={c.id} className="text-xs">
                      {c.nome_conta}: {formatCurrency(c.saldo)}
                    </p>
                  ))}
                </div>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>

      <main className="lg:pl-64 pt-14 lg:pt-0">
        {/* Desktop Header with saldo */}
        <div className="hidden lg:block sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/30">
          <div className="flex items-center justify-end h-16 px-8">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border shadow-sm ${
                  hasLowBalanceAlert 
                    ? "bg-destructive/5 border-destructive/30" 
                    : "bg-card border-border"
                }`}>
                  <div className={`p-1.5 rounded-lg ${hasLowBalanceAlert ? "bg-destructive/10" : "bg-primary/10"}`}>
                    {hasLowBalanceAlert ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : (
                      <Wallet className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  {isLoading ? (
                    <SaldoSkeleton />
                  ) : (
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">
                        Saldo Total {hasLowBalanceAlert && <span className="text-destructive">⚠</span>}
                      </p>
                      <p className={`text-sm font-bold leading-none ${saldoContas >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(saldoContas)}
                      </p>
                      {totalPendente !== 0 && (
                        <p className={`text-[10px] mt-0.5 leading-none ${saldoPrevistoFinal >= 0 ? "text-muted-foreground" : "text-destructive"}`}>
                          Previsto: {formatCurrency(saldoPrevistoFinal)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              {hasLowBalanceAlert && (
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium text-destructive">Contas com saldo abaixo de R$ {SALDO_MINIMO_ALERTA}:</p>
                    {contasBaixoSaldo.map(c => (
                      <p key={c.id} className="text-xs">
                        {c.nome_conta}: {formatCurrency(c.saldo)}
                      </p>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>

      {/* FAB - Quick Add Button */}
      <Button
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg gradient-primary text-primary-foreground z-40"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <QuickAddTransaction open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
};

export default AppLayout;
