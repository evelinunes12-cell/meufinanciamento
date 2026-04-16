import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { extendFixaSeries } from "@/lib/transactions";

/**
 * Runs once per authenticated session: scans all "fixa" (unlimited) recurrence
 * series for the current user and tops them up to a 24-month rolling window
 * if they're getting close to running out.
 *
 * This is what makes subscriptions like Netflix feel truly "unlimited" while
 * still keeping every monthly occurrence as a real, confirmable transaction.
 */
export function useFixaRecurrenceExtender() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ranForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    if (ranForUserRef.current === user.id) return;
    ranForUserRef.current = user.id;

    let cancelled = false;
    (async () => {
      try {
        const { inserted } = await extendFixaSeries(user.id);
        if (!cancelled && inserted > 0) {
          // Refresh views that depend on the transactions table
          queryClient.invalidateQueries({ queryKey: ["transacoes"] });
          queryClient.invalidateQueries({ queryKey: ["saldo-contas"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-financas"] });
          queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
          queryClient.invalidateQueries({ queryKey: ["projecao"] });
        }
      } catch {
        // Silent failure — extension is best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, queryClient]);
}
