import { formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

interface BalanceCardProps {
  balance: string;
  userId: string | null;
  className?: string;
}

/** Hero balance surface. Gradient stays restrained (no AI purple/pink). */
export function BalanceCard({ balance, userId, className }: BalanceCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-6 shadow-sm",
        className,
      )}
    >
      <p className="text-sm font-medium text-muted-foreground">Saldo disponible</p>
      <p className="mt-2 font-mono text-4xl font-semibold tabular-nums tracking-tight">
        {formatUSD(balance)}
      </p>
      {userId && (
        <p className="mt-4 text-xs text-muted-foreground">
          Tu ID de cuenta:{" "}
          <span className="font-mono text-foreground">#{userId}</span>
        </p>
      )}
    </div>
  );
}
