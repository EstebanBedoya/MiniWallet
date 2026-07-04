"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, type SuspiciousTransaction, type SuspiciousReason } from "@/lib/api";
import { messageForError } from "@/lib/errors";
import { useAuth } from "@/lib/auth";
import { Amount } from "@/components/amount";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const REASON_LABELS: Record<SuspiciousReason, string> = {
  HIGH_AMOUNT: "Monto alto",
  VELOCITY: "Velocidad",
  STRUCTURING: "Fraccionamiento",
};

function ReasonBadges({ reasons }: { reasons: SuspiciousReason[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <span
          key={r}
          className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
        >
          {REASON_LABELS[r]}
        </span>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<SuspiciousTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  // Non-admins never see this route.
  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace("/dashboard");
  }, [authLoading, isAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.suspicious());
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount — an accepted Effect use; loading state is intentional here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function act(id: string, action: "approve" | "reject") {
    setActingId(id);
    try {
      if (action === "approve") {
        await api.approve(id);
        toast.success("Transferencia aprobada y liquidada");
      } else {
        await api.reject(id);
        toast.success("Transferencia rechazada y reembolsada");
      }
      await load();
    } catch (err) {
      toast.error(messageForError(err));
    } finally {
      setActingId(null);
    }
  }

  if (authLoading || !isAdmin) {
    return <Skeleton className="h-40 w-full" />;
  }

  // Approvals are driven off the suspicious feed: every held (>= $1000) transfer
  // is HIGH_AMOUNT-flagged, and there is no other admin listing endpoint.
  const pending = items.filter((t) => t.status === "PENDING_REVIEW");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" aria-hidden />
        <h1 className="text-lg font-semibold">Panel de compliance</h1>
      </div>

      <Tabs defaultValue="approvals">
        <TabsList className="w-full">
          <TabsTrigger value="approvals" className="flex-1">
            Aprobaciones
            {pending.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 text-xs text-primary">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="suspicious" className="flex-1">
            Sospechosas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="mt-4">
          <ApprovalsList
            loading={loading}
            error={error}
            items={pending}
            actingId={actingId}
            onAct={act}
            onRetry={load}
          />
        </TabsContent>

        <TabsContent value="suspicious" className="mt-4">
          <SuspiciousList
            loading={loading}
            error={error}
            items={items}
            onRetry={load}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ListProps {
  loading: boolean;
  error: string | null;
  items: SuspiciousTransaction[];
  onRetry: () => void;
}

function ApprovalsList({
  loading,
  error,
  items,
  actingId,
  onAct,
  onRetry,
}: ListProps & {
  actingId: string | null;
  onAct: (id: string, action: "approve" | "reject") => void;
}) {
  if (loading) return <ListSkeleton />;
  if (error) return <ErrorRetry error={error} onRetry={onRetry} />;
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No hay transferencias esperando revisión.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((tx) => {
        const busy = actingId === tx.transactionId;
        return (
          <Card key={tx.transactionId}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <Amount value={tx.amount} className="text-lg" />
                <StatusBadge status={tx.status} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                De <span className="font-mono text-foreground">#{tx.senderId}</span>{" "}
                a <span className="font-mono text-foreground">#{tx.receiverId}</span>
              </p>
              <ReasonBadges reasons={tx.reasons} />

              <div className="flex gap-2 pt-1">
                <ConfirmAction
                  trigger={
                    <Button className="flex-1" disabled={busy}>
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      Aprobar
                    </Button>
                  }
                  title="Aprobar transferencia"
                  description="Se acreditará el monto al destinatario y la transacción quedará liquidada. Esta acción no se puede deshacer."
                  actionLabel="Aprobar"
                  onConfirm={() => onAct(tx.transactionId, "approve")}
                />
                <ConfirmAction
                  trigger={
                    <Button variant="destructive" className="flex-1" disabled={busy}>
                      <X className="size-4" />
                      Rechazar
                    </Button>
                  }
                  title="Rechazar transferencia"
                  description="Se reembolsará el monto al emisor y la transacción quedará rechazada. Esta acción no se puede deshacer."
                  actionLabel="Rechazar"
                  destructive
                  onConfirm={() => onAct(tx.transactionId, "reject")}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SuspiciousList({ loading, error, items, onRetry }: ListProps) {
  if (loading) return <ListSkeleton />;
  if (error) return <ErrorRetry error={error} onRetry={onRetry} />;
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No se detectaron transacciones sospechosas.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((tx) => (
        <Card key={tx.transactionId}>
          <CardContent className="space-y-2 pt-4">
            <div className="flex items-center justify-between">
              <Amount value={tx.amount} />
              <StatusBadge status={tx.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              De <span className="font-mono text-foreground">#{tx.senderId}</span> a{" "}
              <span className="font-mono text-foreground">#{tx.receiverId}</span>
            </p>
            <ReasonBadges reasons={tx.reasons} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ConfirmAction({
  trigger,
  title,
  description,
  actionLabel,
  destructive,
  onConfirm,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  actionLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  // Base UI's AlertDialogAction is a plain Button (no auto-close), so control
  // the open state and close it explicitly after confirming.
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : ""}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

function ErrorRetry({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
      <Button variant="outline" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
