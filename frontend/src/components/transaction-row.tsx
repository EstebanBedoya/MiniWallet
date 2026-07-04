import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Amount } from "@/components/amount";
import { StatusBadge } from "@/components/status-badge";
import type { Transaction } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TransactionRowProps {
  tx: Transaction;
  /** Current user id, to render the transfer direction from their point of view. */
  currentUserId: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function TransactionRow({ tx, currentUserId }: TransactionRowProps) {
  const isOutgoing = tx.senderId === currentUserId;
  const counterparty = isOutgoing ? tx.receiverId : tx.senderId;

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          isOutgoing
            ? "bg-muted text-muted-foreground"
            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        )}
        aria-hidden
      >
        {isOutgoing ? (
          <ArrowUpRight className="size-5" />
        ) : (
          <ArrowDownLeft className="size-5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {isOutgoing ? "Enviada a" : "Recibida de"}{" "}
          <span className="font-mono text-muted-foreground">#{counterparty}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {dateFormatter.format(new Date(tx.createdAt))}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1">
        <Amount value={tx.amount} direction={isOutgoing ? "out" : "in"} />
        <StatusBadge status={tx.status} />
      </div>
    </div>
  );
}
