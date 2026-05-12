import { useCallback, useEffect, useState } from "react";

/**
 * Tamanhos de widget no grid de 4 colunas (em telas lg+).
 * No mobile/tablet todos ocupam 100% da largura.
 */
export type WidgetSize = "sm" | "md" | "lg" | "full";

export interface WidgetConfig {
  id: string;
  size: WidgetSize;
  visible: boolean;
}

export type WidgetCatalog = Record<string, { label: string; defaultSize: WidgetSize; defaultVisible?: boolean }>;

const STORAGE_KEY = "dashboard-financas-layout-v1";

/**
 * Mapeia o tamanho preset para o número de colunas no grid de 4 colunas.
 */
export const SIZE_TO_COLSPAN: Record<WidgetSize, string> = {
  sm: "lg:col-span-1",
  md: "lg:col-span-2",
  lg: "lg:col-span-3",
  full: "lg:col-span-4",
};

export const SIZE_LABELS: Record<WidgetSize, string> = {
  sm: "Pequeno",
  md: "Médio",
  lg: "Grande",
  full: "Largura total",
};

const buildDefaults = (catalog: WidgetCatalog): WidgetConfig[] =>
  Object.entries(catalog).map(([id, def]) => ({
    id,
    size: def.defaultSize,
    visible: def.defaultVisible !== false,
  }));

const mergeWithCatalog = (saved: WidgetConfig[], catalog: WidgetCatalog): WidgetConfig[] => {
  const known = new Set(Object.keys(catalog));
  const seen = new Set<string>();
  const result: WidgetConfig[] = [];

  // mantém ordem salva apenas para ids ainda existentes no catálogo
  saved.forEach((w) => {
    if (known.has(w.id) && !seen.has(w.id)) {
      const def = catalog[w.id];
      result.push({
        id: w.id,
        size: w.size ?? def.defaultSize,
        visible: typeof w.visible === "boolean" ? w.visible : def.defaultVisible !== false,
      });
      seen.add(w.id);
    }
  });

  // adiciona widgets novos no fim
  Object.entries(catalog).forEach(([id, def]) => {
    if (!seen.has(id)) {
      result.push({ id, size: def.defaultSize, visible: def.defaultVisible !== false });
    }
  });

  return result;
};

export function useDashboardLayout(catalog: WidgetCatalog) {
  const [layout, setLayout] = useState<WidgetConfig[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return mergeWithCatalog(JSON.parse(raw), catalog);
    } catch {
      /* ignore */
    }
    return buildDefaults(catalog);
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      /* ignore */
    }
  }, [layout]);

  const setSize = useCallback((id: string, size: WidgetSize) => {
    setLayout((prev) => prev.map((w) => (w.id === id ? { ...w, size } : w)));
  }, []);

  const setVisible = useCallback((id: string, visible: boolean) => {
    setLayout((prev) => prev.map((w) => (w.id === id ? { ...w, visible } : w)));
  }, []);

  const toggleVisible = useCallback((id: string) => {
    setLayout((prev) => prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  }, []);

  const reorder = useCallback((fromId: string, toId: string) => {
    setLayout((prev) => {
      const from = prev.findIndex((w) => w.id === fromId);
      const to = prev.findIndex((w) => w.id === toId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setLayout(buildDefaults(catalog));
  }, [catalog]);

  return { layout, setLayout, setSize, setVisible, toggleVisible, reorder, reset };
}
