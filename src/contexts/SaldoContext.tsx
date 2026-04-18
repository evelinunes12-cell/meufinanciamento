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
  incluir_no_saldo: boolean | null;
}

interface Transacao {
  id: string;
  valor: number;
  tipo: string;
  data: string;
  conta_id: string;
  conta_destino_id: string | null;
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
      .select("id, valor, tipo, data, conta_id, conta_destino_id, forma_pagamento, is_pago_executado"),
  ]);

  return {
    contas: (contasRes.data || []) as Conta[],
    transacoes: (transacoesRes.data || []) as Transacao[],
  };
}

function calculateSaldoContas(contas: Conta[], transacoes: Transacao[]): number {
  const transacoesValidas = transacoes.filter((t) => t.is_pago_executado !== false);

  return contas.reduce((acc, conta) => {
    // Skip credit accounts from total balance
    if (conta.tipo === "credito") return acc;

    const saldoConta = transacoesValidas.reduce((saldo, transacao) => {
      const valor = Number(transacao.valor);
      const isTransferencia = transacao.forma_pagamento === "transferencia";

      if (isTransferencia) {
        // Only process the expense record (has conta_destino_id).
        // The auto-generated receipt record is a duplicate – skip it.
        if (transacao.conta_destino_id) {
          if (transacao.conta_id === conta.id) return saldo - valor;
          if (transacao.conta_destino_id === conta.id) return saldo + valor;
        }
        return saldo;
      }

      if (transacao.tipo === "receita" && transacao.conta_id === conta.id) {
        return saldo + valor;
      }

      if (transacao.tipo === "despesa" && transacao.conta_id === conta.id) {
        return saldo - valor;
      }

      return saldo;
    }, Number(conta.saldo_inicial));

    return acc + saldoConta;
  }, 0);
}

export function SaldoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["saldo-contas", user?.id],
    queryFn: () => fetchSaldoData(user?.id),
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
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
