import { ReactNode, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  /** Override manual do tipo de layout, caso a rota não esteja mapeada. */
  variant?: PageVariant;
  /** Override direto do min-height (ex: "70vh"). Tem prioridade sobre variant/rota. */
  minHeight?: string;
}

type PageVariant = "dashboard" | "list" | "form" | "compact";

/**
 * Mapa de min-height por tipo de página.
 * Mantém o container com altura mínima consistente para evitar
 * "saltos" de layout durante a troca de abas e o carregamento dos dados.
 */
const MIN_HEIGHT_BY_VARIANT: Record<PageVariant, string> = {
  dashboard: "calc(100vh - 8rem)", // dashboards densos com KPIs + gráficos
  list: "calc(100vh - 8rem)",      // listagens paginadas (transações, parcelas...)
  form: "calc(100vh - 12rem)",     // formulários e configurações
  compact: "auto",                  // páginas pequenas (auth, 404...)
};

/**
 * Heurística por rota → variante de layout.
 * Pode ser estendida conforme novas páginas forem adicionadas.
 */
const routeToVariant = (pathname: string): PageVariant => {
  // Dashboards
  if (
    pathname === "/financas" ||
    pathname.startsWith("/financas/dashboard") ||
    pathname.startsWith("/financiamento/dashboard") ||
    pathname === "/dashboard"
  ) {
    return "dashboard";
  }

  // Listagens / tabelas
  if (
    pathname.startsWith("/financas/transacoes") ||
    pathname.startsWith("/financas/recorrencias") ||
    pathname.startsWith("/financas/cartoes") ||
    pathname.startsWith("/financas/contas") ||
    pathname.startsWith("/financas/categorias") ||
    pathname.startsWith("/financas/orcamento") ||
    pathname.startsWith("/financas/projecao") ||
    pathname.startsWith("/financas/relatorios") ||
    pathname.startsWith("/financiamento/parcelas") ||
    pathname.startsWith("/parcelas")
  ) {
    return "list";
  }

  // Formulários / configurações
  if (
    pathname.startsWith("/financas/configuracoes") ||
    pathname.startsWith("/financiamento/config")
  ) {
    return "form";
  }

  return "compact";
};

/**
 * Wrapper padrão para o conteúdo das páginas internas.
 * - Garante espaçamento vertical consistente (space-y-6).
 * - Aplica min-height calculado por rota para manter a mesma altura
 *   entre páginas, evitando mudanças bruscas no layout ao trocar de aba.
 */
const PageContainer = ({
  children,
  className,
  variant,
  minHeight,
}: PageContainerProps) => {
  const location = useLocation();

  const computedMinHeight = useMemo(() => {
    if (minHeight) return minHeight;
    const v = variant ?? routeToVariant(location.pathname);
    return MIN_HEIGHT_BY_VARIANT[v];
  }, [minHeight, variant, location.pathname]);

  return (
    <div
      className={cn("space-y-6 animate-fade-in", className)}
      style={{ minHeight: computedMinHeight }}
    >
      {children}
    </div>
  );
};

export default PageContainer;
