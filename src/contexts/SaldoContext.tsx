import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
}

interface SaldoContextType {
  saldoContas: number;
  isLoading: boolean;
  refetch: () => void;
}

const SaldoContext = createContext<SaldoContextType | undefined>(undefined);

async function fetchSaldoData(userId: string | undefined) {
  if (!userId) return { contas: [], transacoes: [] };

  const [contasRes, transacoesRes] = await Promise.all([
    supabase.from("contas").select("*"),
    supabase
      .from("transacoes")
      .select("id, valor, tipo, conta_id, forma_pagamento, is_pago_executado"),
  ]);

  return {
    contas: (contasRes.data || []) as Conta[],
    transacoes: (transacoesRes.data || []) as Transacao[],
  };
}

function calculateSaldoContas(contas: Conta[], transacoes: Transacao[]): number {
  const transacoesValidas = transacoes.filter(
    (t) =>
      t.forma_pagamento !== "transferencia" &&
      t.forma_pagamento !== "transferencia_entre_contas" &&
      t.is_pago_executado !== false
  );

  return contas.reduce((acc, conta) => {
    const transacoesConta = transacoesValidas.filter((t) => t.conta_id === conta.id);
    const receitas = transacoesConta
      .filter((t) => t.tipo === "receita")
      .reduce((a, t) => a + Number(t.valor), 0);
    const despesas = transacoesConta
      .filter((t) => t.tipo === "despesa")
      .reduce((a, t) => a + Number(t.valor), 0);
    return acc + Number(conta.saldo_inicial) + receitas - despesas;
  }, 0);
}

export function SaldoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["saldo-contas", user?.id],
    queryFn: () => fetchSaldoData(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const saldoContas = data
    ? calculateSaldoContas(data.contas, data.transacoes)
    : 0;

  return (
    <SaldoContext.Provider value={{ saldoContas, isLoading, refetch }}>
      {children}
    </SaldoContext.Provider>
  );
}

export function useSaldo() {
  const context = useContext(SaldoContext);
  if (context === undefined) {
    throw new Error("useSaldo must be used within a SaldoProvider");
  }
  return context;
}
