import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PredictiveTransaction {
  key: string;
  descricao: string;
  categoria_id: string | null;
  conta_id: string;
  forma_pagamento: string;
  tipo: string;
  valor: number; // valor recorrente que dispara a sugestão
  count: number;
}

interface RawTx {
  descricao: string | null;
  categoria_id: string | null;
  conta_id: string;
  forma_pagamento: string;
  tipo: string;
  valor: number;
}

const MIN_OCCURRENCES = 10;

function mode<T>(items: T[]): T {
  const counts = new Map<T, number>();
  let best = items[0];
  let bestCount = 0;
  for (const it of items) {
    const c = (counts.get(it) || 0) + 1;
    counts.set(it, c);
    if (c > bestCount) {
      bestCount = c;
      best = it;
    }
  }
  return best;
}

async function fetchPredictive(userId: string): Promise<PredictiveTransaction[]> {
  // Histórico completo do usuário (sem janela de tempo): agrupa por VALOR recorrente
  const { data, error } = await supabase
    .from("transacoes")
    .select("descricao, categoria_id, conta_id, forma_pagamento, tipo, valor")
    .eq("user_id", userId)
    .eq("tipo", "despesa")
    .neq("forma_pagamento", "transferencia");

  if (error || !data) return [];

  // Agrupa por valor (arredondado a 2 casas)
  const groups = new Map<number, RawTx[]>();
  for (const t of data as RawTx[]) {
    const v = Math.round(Number(t.valor) * 100) / 100;
    if (!v) continue;
    const arr = groups.get(v);
    if (arr) arr.push(t);
    else groups.set(v, [t]);
  }

  return Array.from(groups.entries())
    .filter(([, arr]) => arr.length >= MIN_OCCURRENCES)
    .map(([valor, arr]) => {
      const descs = arr.map((t) => (t.descricao || "").trim()).filter(Boolean);
      const descricao = descs.length ? mode(descs) : "";
      return {
        key: `v-${valor}`,
        descricao,
        categoria_id: mode(arr.map((t) => t.categoria_id)),
        conta_id: mode(arr.map((t) => t.conta_id)),
        forma_pagamento: mode(arr.map((t) => t.forma_pagamento)),
        tipo: mode(arr.map((t) => t.tipo)),
        valor,
        count: arr.length,
      } as PredictiveTransaction;
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

export function usePredictiveTransactions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["predictive-transactions", user?.id],
    queryFn: () => fetchPredictive(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
