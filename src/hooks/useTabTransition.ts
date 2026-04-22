import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Gerencia uma transição visual breve ao trocar o valor de um Tabs.
 * Enquanto `isTransitioning === true`, a página deve renderizar o
 * `TabContentSkeleton` no lugar do conteúdo da aba — evitando exibição
 * parcial de dados enquanto o React reconcilia/filtra a nova tab.
 *
 * @param initial valor inicial da aba
 * @param duration duração do skeleton em ms (default 180ms)
 */
export function useTabTransition<T extends string>(
  initial: T,
  duration = 180
) {
  const [tab, setTab] = useState<T>(initial);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (next: string) => {
      if (next === tab) return;
      setIsTransitioning(true);
      setTab(next as T);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsTransitioning(false);
      }, duration);
    },
    [tab, duration]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { tab, setTab: handleChange, isTransitioning };
}
