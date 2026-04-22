import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PageType = "dashboard" | "list" | "cards" | "report" | "tabs" | "tabContent" | "table";

interface PageLoadingSkeletonProps {
  type?: PageType;
  title?: string;
  /** Quantidade de KPI/stat cards exibidos no topo (default 4). */
  statsCount?: number;
  /** Mostra placeholder para um botão de ação no header. */
  showAction?: boolean;
  /** Para type="table": número de colunas (default 8). */
  tableColumns?: number;
  /** Para type="table": número de linhas (default 10). */
  tableRows?: number;
}

const StatsCardsSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-6 w-28 mb-1.5" />
          <Skeleton className="h-3 w-16" />
        </CardContent>
      </Card>
    ))}
  </div>
);

const ListSkeleton = () => (
  <Card>
    <CardContent className="p-0">
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="space-y-1.5 min-w-0 flex-1">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-24 max-w-full" />
              </div>
            </div>
            <Skeleton className="h-5 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

const CardGridSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-5 w-24 mb-2" />
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>
    ))}
  </div>
);

const ChartSkeleton = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    {Array.from({ length: 2 }).map((_, i) => (
      <Card key={i}>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full rounded-lg" />
        </CardContent>
      </Card>
    ))}
  </div>
);

const TabsSkeleton = () => (
  <div className="space-y-4">
    <div className="grid w-full grid-cols-3 max-w-xl gap-1 p-1 bg-muted rounded-lg">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-8 rounded-md" />
      ))}
    </div>
    <CardGridSkeleton count={6} />
  </div>
);

/**
 * Skeleton para tabela densa (header + N linhas) — usado em
 * páginas como Transações e Parcelas para evitar o "salto" de
 * layout quando os dados chegam após o fetch inicial.
 */
const TableSkeleton = ({
  columns = 8,
  rows = 10,
}: {
  columns?: number;
  rows?: number;
}) => {
  const cols = Array.from({ length: columns });
  const rws = Array.from({ length: rows });
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((_, i) => (
                <TableHead key={i} className={i === columns - 1 ? "text-right" : ""}>
                  <Skeleton
                    className={`h-4 ${i === columns - 1 ? "w-16 ml-auto" : "w-20"}`}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rws.map((_, r) => (
              <TableRow key={r}>
                {cols.map((_, c) => (
                  <TableCell key={c} className={c === columns - 1 ? "text-right" : ""}>
                    <Skeleton
                      className={`h-4 ${
                        c === 0
                          ? "w-8"
                          : c === columns - 1
                          ? "w-16 ml-auto"
                          : c % 3 === 0
                          ? "w-28"
                          : "w-20"
                      }`}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

const PageLoadingSkeleton = ({
  type = "dashboard",
  title,
  statsCount,
  showAction = true,
  tableColumns,
  tableRows,
}: PageLoadingSkeletonProps) => {
  // Defaults sensatos por tipo
  const resolvedStats =
    statsCount ?? (type === "dashboard" ? 6 : type === "report" ? 4 : 4);

  return (
    <div className="space-y-6 animate-fade-in min-h-[60vh]">
      {/* Page header — espelha estrutura do PageHeader (icon + título + descrição + ação) */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            {title ? (
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                {title}
              </h1>
            ) : (
              <Skeleton className="h-7 sm:h-8 w-48" />
            )}
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
        </div>
        {showAction && <Skeleton className="h-9 w-32 rounded-md shrink-0" />}
      </header>

      {type === "dashboard" && (
        <>
          <StatsCardsSkeleton count={resolvedStats} />
          <ChartSkeleton />
        </>
      )}

      {type === "list" && (
        <>
          {/* Filter bar */}
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
          <TableSkeleton columns={tableColumns ?? 8} rows={tableRows ?? 10} />
        </>
      )}

      {type === "table" && (
        <>
          <StatsCardsSkeleton count={resolvedStats} />
          <TableSkeleton columns={tableColumns ?? 8} rows={tableRows ?? 10} />
        </>
      )}

      {type === "cards" && <CardGridSkeleton />}

      {type === "report" && (
        <>
          <StatsCardsSkeleton count={resolvedStats} />
          <ListSkeleton />
        </>
      )}

      {type === "tabs" && <TabsSkeleton />}
    </div>
  );
};

/**
 * Skeleton compacto para transição interna de Tabs (`onValueChange`).
 * Mostra apenas o conteúdo da aba (sem repetir header/KPIs da página),
 * evitando render parcial enquanto os dados da aba carregam.
 */
export const TabContentSkeleton = ({
  variant = "cards",
  count,
}: {
  variant?: "cards" | "list" | "table";
  count?: number;
}) => {
  if (variant === "list") {
    return <ListSkeleton />;
  }
  if (variant === "table") {
    return <TableSkeleton rows={count ?? 8} />;
  }
  return <CardGridSkeleton count={count ?? 6} />;
};

export { TableSkeleton };

export default PageLoadingSkeleton;
