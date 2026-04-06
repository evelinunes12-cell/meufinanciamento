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
  const duplicatedTransferIncomeIds = new Set<string>();
  const transferExpenseCounts = new Map<string, number>();

  const getTransferKey = (contaId: string, valor: number, data: string) =>
    `${contaId}|${valor}|${data}`;

  transacoesValidas.forEach((transacao) => {
    const isTransferExpense =
      transacao.forma_pagamento === "transferencia" &&
      transacao.tipo === "despesa" &&
      !!transacao.conta_destino_id;

    if (!isTransferExpense) return;

    const key = getTransferKey(
      transacao.conta_destino_id as string,
      Number(transacao.valor),
      transacao.data,
    );

    transferExpenseCounts.set(key, (transferExpenseCounts.get(key) || 0) + 1);
  });

  transacoesValidas.forEach((transacao) => {
    const isPotentialDuplicatedIncome =
      transacao.forma_pagamento === "transferencia" &&
      transacao.tipo === "receita" &&
      !transacao.conta_destino_id;

    if (!isPotentialDuplicatedIncome) return;

    const key = getTransferKey(
      transacao.conta_id,
      Number(transacao.valor),
      transacao.data,
    );
    const availableMatches = transferExpenseCounts.get(key) || 0;

    if (availableMatches > 0) {
      duplicatedTransferIncomeIds.add(transacao.id);
      transferExpenseCounts.set(key, availableMatches - 1);
    }
  });

  return contas.reduce((acc, conta) => {
    const saldoConta = transacoesValidas.reduce((saldo, transacao) => {
      const valor = Number(transacao.valor);

      if (transacao.forma_pagamento === "transferencia" && transacao.conta_destino_id) {
        if (transacao.conta_id === conta.id) return saldo - valor;
        if (transacao.conta_destino_id === conta.id) return saldo + valor;
        return saldo;
      }

      if (duplicatedTransferIncomeIds.has(transacao.id)) {
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
