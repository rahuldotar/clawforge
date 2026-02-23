export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-card rounded-lg border border-border p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold mb-4">{children}</h3>;
}

export function StatCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string | number;
  variant?: "default" | "success" | "danger" | "warning";
}) {
  const colors = {
    default: "text-foreground",
    success: "text-green-600",
    danger: "text-red-600",
    warning: "text-amber-600",
  };

  return (
    <Card>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[variant]}`}>{value}</p>
    </Card>
  );
}
