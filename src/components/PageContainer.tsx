import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper padrão para o conteúdo das páginas internas.
 * Garante espaçamento vertical consistente entre seções (header, KPIs, listas, etc.)
 * eliminando variações ao trocar de aba.
 */
const PageContainer = ({ children, className }: PageContainerProps) => {
  return (
    <div className={cn("space-y-6 animate-fade-in", className)}>
      {children}
    </div>
  );
};

export default PageContainer;
