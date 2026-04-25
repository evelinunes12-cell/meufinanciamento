import { cn } from "@/lib/utils";

/**
 * Skeleton padronizado do sistema.
 *
 * Usa a utilitária `skeleton-shimmer` (definida em `index.css`) para
 * garantir uma única animação (fade + shine) em TODOS os skeletons —
 * cards, listas, tabelas, KPIs e transições internas — reduzindo a
 * sensação de "layout shift" entre estados de carregamento.
 *
 * Respeita `prefers-reduced-motion`: cai para um pulse suave quando
 * o usuário pede menos movimento.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
