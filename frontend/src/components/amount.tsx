import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/money";

interface AmountProps {
  value: string;
  /** Optional direction: "in" credits (green), "out" debits (muted with −). */
  direction?: "in" | "out";
  className?: string;
}

/** Money rendered in tabular mono figures to keep columns aligned. */
export function Amount({ value, direction, className }: AmountProps) {
  const prefix = direction === "in" ? "+" : direction === "out" ? "−" : "";
  return (
    <span
      className={cn(
        "font-mono tabular-nums whitespace-nowrap",
        direction === "in" && "text-emerald-600 dark:text-emerald-400",
        className,
      )}
    >
      {prefix}
      {formatUSD(value)}
    </span>
  );
}
