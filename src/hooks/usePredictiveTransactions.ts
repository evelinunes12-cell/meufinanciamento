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
  valor: number;
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

async function fetchPredictive(userId: string): Promise<PredictiveTransaction[]> {
  // Últimos 90 dias, despesas e receitas (sem transferências)
  const since = format(subDays(new Date(), 90), "yyyy-MM-dd");
  const { data, error } = await supabase
    .from("transacoes")
    .select("descricao, categoria_id, conta_id, forma_pagamento, tipo, valor")
    .eq("user_id", userId)
    .neq("forma_pagamento", "transferencia")
    .gte("data", since);

  if (error || !data) return [];

  // Agrupa por (tipo + valor + descrição + categoria + conta) para preservar a
  // identidade da transação e permitir filtragem por valor digitado em tempo real.
  const groups = new Map<string, { meta: RawTx; valor: number; count: number }>();
  for (const t of data as RawTx[]) {
    const valor = Math.round(Number(t.valor) * 100) / 100;
    if (!valor) continue;
    const desc = (t.descricao || "").trim();
    if (!desc) continue;
    const key = `${t.tipo}|${valor}|${desc.toLowerCase()}|${t.categoria_id || ""}|${t.conta_id}`;
    const entry = groups.get(key);
    if (entry) entry.count += 1;
    else groups.set(key, { meta: t, valor, count: 1 });
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
      valor: v.valor,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count);
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
