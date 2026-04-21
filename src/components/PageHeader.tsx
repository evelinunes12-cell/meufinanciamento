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
 * evita pequenas variações de layout ao trocar de aba.
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
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
};

export default PageHeader;
