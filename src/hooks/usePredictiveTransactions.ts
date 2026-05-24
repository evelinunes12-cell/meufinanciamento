import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { subDays, format } from "date-fns";

export interface PredictiveTransaction {
  key: string;
  descricao: string;
  categoria_id: string | null;
  conta_id: string;
  forma_pagamento: string;
  tipo: string;
  valor: number; // valor modal (mais comum)
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

function modalValue(values: number[]): number {
  // Round to 2 decimals for grouping
  const counts = new Map<number, number>();
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const r = Math.round(v * 100) / 100;
    const c = (counts.get(r) || 0) + 1;
    counts.set(r, c);
    if (c > bestCount) {
      bestCount = c;
      best = r;
    }
  }
  return best;
}

async function fetchPredictive(userId: string): Promise<PredictiveTransaction[]> {
  const since = format(subDays(new Date(), 60), "yyyy-MM-dd");
  const { data, error } = await supabase
    .from("transacoes")
    .select("descricao, categoria_id, conta_id, forma_pagamento, tipo, valor")
    .eq("user_id", userId)
    .eq("tipo", "despesa")
    .neq("forma_pagamento", "transferencia")
    .gte("data", since);

  if (error || !data) return [];

  const groups = new Map<string, { meta: RawTx; values: number[]; count: number }>();
  for (const t of data as RawTx[]) {
    const desc = (t.descricao || "").trim();
    if (!desc) continue;
    const key = `${desc.toLowerCase()}|${t.categoria_id || ""}|${t.conta_id}`;
    const entry = groups.get(key);
    if (entry) {
      entry.values.push(Number(t.valor));
      entry.count += 1;
    } else {
      groups.set(key, { meta: t, values: [Number(t.valor)], count: 1 });
    }
  }

  return Array.from(groups.entries())
    .filter(([, v]) => v.count >= 2)
    .map(([key, v]) => ({
      key,
      descricao: v.meta.descricao || "",
      categoria_id: v.meta.categoria_id,
      conta_id: v.meta.conta_id,
      forma_pagamento: v.meta.forma_pagamento,
      tipo: v.meta.tipo,
      valor: modalValue(v.values),
      count: v.count,
    }))
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
