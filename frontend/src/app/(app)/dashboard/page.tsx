"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Send, ArrowRight } from "lucide-react";
import { api, ApiError, type Account, type Transaction } from "@/lib/api";
import { messageForError } from "@/lib/errors";
import { useAuth } from "@/lib/auth";
import { BalanceCard } from "@/components/balance-card";
import { TransactionRow } from "@/components/transaction-row";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function DashboardPage() {
  const { userId } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  // Admin users are bootstrapped without a ledger wallet, so /accounts/me 404s.
  const [noWallet, setNoWallet] = useState(false);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  // Independent error slots so one failing call never hides the other's data.
  const [accountError, setAccountError] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAccountError(null);
    setTxError(null);
    setNoWallet(false);
    // Load balance and history independently — a missing wallet must not blank
    // out the transaction list, and vice versa.
    const [acc, txs] = await Promise.allSettled([
      api.account(),
      api.transactions(1, 5),
    ]);

    if (acc.status === "fulfilled") {
      setAccount(acc.value);
    } else if (acc.reason instanceof ApiError && acc.reason.code === "ACCOUNT_NOT_FOUND") {
      setNoWallet(true);
    } else {
      setAccountError(messageForError(acc.reason));
    }

    if (txs.status === "fulfilled") {
      setRecent(txs.value.data);
    } else if (!(txs.reason instanceof ApiError && txs.reason.code === "ACCOUNT_NOT_FOUND")) {
      setTxError(messageForError(txs.reason));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    // Fetch on mount — an accepted Effect use; loading state is intentional here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      {loading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : account ? (
        <BalanceCard
          balance={account.balanceAvailable}
          pendingIncoming={account.pendingIncoming}
          pendingOutgoing={account.pendingOutgoing}
          userId={userId}
        />
      ) : noWallet ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm font-medium">Cuenta administrativa</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta cuenta no tiene wallet. Usá el panel de compliance para revisar
            transferencias.
          </p>
        </div>
      ) : accountError ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6">
          <p role="alert" className="text-sm text-destructive">
            No se pudo cargar el saldo: {accountError}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1">
        <Button render={<Link href="/transfer" />} size="lg" className="h-12">
          <Send className="size-4" />
          Enviar dinero
        </Button>
      </div>

      <section aria-labelledby="recent-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="recent-heading" className="text-sm font-semibold">
            Movimientos recientes
          </h2>
          <Link
            href="/history"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Ver todo <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {txError ? (
          <p role="alert" className="text-sm text-destructive">
            {txError}
          </p>
        ) : loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Todavía no tenés movimientos. Enviá tu primera transferencia.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((tx, i) => (
              <TransactionRow key={`${tx.transactionId}-${i}`} tx={tx} currentUserId={userId} />
            ))}
          </div>
        )}

        {!loading && !txError && recent.length > 0 && <Separator className="mt-2" />}
      </section>
    </div>
  );
}
