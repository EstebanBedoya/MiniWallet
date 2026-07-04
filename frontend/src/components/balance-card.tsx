import { formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

interface BalanceCardProps {
  balance: string;
  pendingIncoming?: string;
  pendingOutgoing?: string;
  userId: string | null;
  className?: string;
}

// True when a pending string represents a non-zero amount.
function hasAmount(value?: string): boolean {
  return !!value && Number(value) > 0;
}

/** Hero balance surface. Gradient stays restrained (no AI purple/pink). */
export function BalanceCard({
  balance,
  pendingIncoming,
  pendingOutgoing,
  userId,
  className,
}: BalanceCardProps) {
  const showOutgoing = hasAmount(pendingOutgoing);
  const showIncoming = hasAmount(pendingIncoming);

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

      {(showOutgoing || showIncoming) && (
        <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
          {showOutgoing && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Retenido (en revisión)</dt>
              <dd className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {formatUSD(pendingOutgoing!)}
              </dd>
            </div>
          )}
          {showIncoming && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Por recibir (si se aprueba)</dt>
              <dd className="font-mono tabular-nums text-muted-foreground">
                {formatUSD(pendingIncoming!)}
              </dd>
            </div>
          )}
        </dl>
      )}

      {userId && (
        <p className="mt-4 text-xs text-muted-foreground">
          Tu ID de cuenta:{" "}
          <span className="font-mono text-foreground">#{userId}</span>
        </p>
      )}
    </div>
  );
}
