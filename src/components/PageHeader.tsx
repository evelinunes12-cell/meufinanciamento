import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Conteúdo opcional renderizado à direita do header (botões, toggles, etc.) */
  actions?: ReactNode;
  className?: string;
}

/**
 * Header padronizado para todas as páginas internas.
 * Mantém alinhamento, tipografia e espaçamentos consistentes —
 * com ALTURA FIXA para evitar saltos de layout ao trocar de aba,
 * mesmo quando há (ou não) descrição/ações/ícone.
 *
 * Alturas garantidas:
 *  - Mobile: 72px (4.5rem) — título + 1 linha de descrição
 *  - Desktop (sm+): 64px (4rem) — layout horizontal
 */
const PageHeader = ({
  title,
  description,
  icon,
  actions,
  className,
}: PageHeaderProps) => {
  return (
    <header
      className={cn(
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4",
        // Altura mínima estável (evita "pulo" ao trocar de página)
        "min-h-[4.5rem] sm:min-h-16",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate leading-tight">
            {title}
          </h1>
          {/* Linha de descrição com altura reservada mesmo quando vazia */}
          <p
            className={cn(
              "text-sm text-muted-foreground mt-0.5 line-clamp-1 min-h-[1.25rem]",
              !description && "invisible"
            )}
          >
            {description ?? "placeholder"}
          </p>
        </div>
      </div>
      {/* Slot de ações com altura reservada mesmo quando vazio */}
      <div
        className={cn(
          "flex items-center gap-2 shrink-0 min-h-10",
          !actions && "hidden sm:flex sm:invisible"
        )}
      >
        {actions}
      </div>
    </header>
  );
};

export default PageHeader;
