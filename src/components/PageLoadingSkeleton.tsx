import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type PageType = "dashboard" | "list" | "cards" | "report";

interface PageLoadingSkeletonProps {
  type?: PageType;
  title?: string;
}

const StatsCardsSkeleton = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <Card key={i}>
        <CardContent className="p-4">
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-6 w-28" />
        </CardContent>
      </Card>
    ))}
  </div>
);

const ListSkeleton = () => (
  <Card>
    <CardContent className="p-0">
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

const CardGridSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <Card key={i}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-5 w-24" />
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
          <Skeleton className="h-48 w-full rounded-lg" />
        </CardContent>
      </Card>
    ))}
  </div>
);

const PageLoadingSkeleton = ({ type = "dashboard", title }: PageLoadingSkeletonProps) => {
  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Page header skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="space-y-1.5">
          {title ? (
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h1>
          ) : (
            <Skeleton className="h-7 w-48" />
          )}
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {type === "dashboard" && (
        <>
          <StatsCardsSkeleton />
          <ChartSkeleton />
        </>
      )}

      {type === "list" && (
        <>
          {/* Filter bar skeleton */}
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
          <ListSkeleton />
        </>
      )}

      {type === "cards" && <CardGridSkeleton />}

      {type === "report" && (
        <>
          <StatsCardsSkeleton />
          <ListSkeleton />
        </>
      )}
    </div>
  );
};

export default PageLoadingSkeleton;
