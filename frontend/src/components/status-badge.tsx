import { cn } from "@/lib/utils";
import type { TransactionStatus } from "@/lib/api";

// Color is never the ONLY signal — each status also has a distinct label.
const STATUS_CONFIG: Record<
  TransactionStatus,
  { label: string; className: string }
> = {
  SETTLED: {
    label: "Liquidada",
    className:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  PENDING_REVIEW: {
    label: "En revisión",
    className:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  APPROVED: {
    label: "Aprobada",
    className:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  },
  REJECTED: {
    label: "Rechazada",
    className: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  },
};

export function StatusBadge({ status }: { status: TransactionStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}
