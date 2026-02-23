export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
