"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { messageForError } from "@/lib/errors";
import { useAuth } from "@/lib/auth";
import { isHoldAmount, isValidAmount, formatUSD } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function TransferPage() {
  const router = useRouter();
  const { userId } = useAuth();
  const [receiverId, setReceiverId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Idempotency key: one fresh key per distinct (receiver, amount) attempt,
  // reused verbatim on retry so a network-timeout retry never double-spends.
  const keyRef = useRef<{ signature: string; key: string } | null>(null);

  function idempotencyKeyFor(signature: string): string {
    if (!keyRef.current || keyRef.current.signature !== signature) {
      keyRef.current = { signature, key: crypto.randomUUID() };
    }
    return keyRef.current.key;
  }

  const validAmount = isValidAmount(amount);
  const validReceiver = /^\d+$/.test(receiverId);
  const isSelf = receiverId !== "" && receiverId === userId;
  const willHold = validAmount && isHoldAmount(amount);
  const canSubmit = validAmount && validReceiver && !isSelf && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSelf) {
      setError("No podés transferirte a vos mismo.");
      return;
    }
    if (!validAmount) {
      setError("Ingresá un monto válido mayor a cero (hasta 2 decimales).");
      return;
    }

    setSubmitting(true);
    const signature = `${receiverId}:${amount}`;
    try {
      const result = await api.transfer(
        { receiverId, amount },
        idempotencyKeyFor(signature),
      );
      keyRef.current = null; // consumed — next transfer gets a new key

      if (result.status === "PENDING_REVIEW") {
        toast.info("Transferencia enviada a revisión de compliance", {
          description: `${formatUSD(result.amount)} quedará retenida hasta ser aprobada.`,
          icon: <ShieldAlert className="size-4" />,
        });
      } else {
        toast.success("Transferencia liquidada", {
          description: `Enviaste ${formatUSD(result.amount)}.`,
          icon: <CheckCircle2 className="size-4" />,
        });
      }
      router.push("/dashboard");
    } catch (err) {
      // On idempotency conflict the key is poisoned — force a new one next time.
      if (err instanceof ApiError && err.code === "IDEMPOTENCY_KEY_CONFLICT") {
        keyRef.current = null;
      }
      setError(messageForError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Enviar dinero</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="receiverId">ID del destinatario</Label>
              <Input
                id="receiverId"
                inputMode="numeric"
                placeholder="Ej. 42"
                value={receiverId}
                onChange={(e) =>
                  setReceiverId(e.target.value.replace(/[^\d]/g, ""))
                }
                aria-invalid={isSelf}
                required
              />
              {isSelf && (
                <p className="text-xs text-destructive">
                  No podés transferirte a vos mismo.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Monto (USD)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d.]/g, ""))
                }
                aria-invalid={amount !== "" && !validAmount}
                required
              />
              <p className="text-xs text-muted-foreground">
                Hasta 2 decimales. Debe ser mayor a cero.
              </p>
            </div>

            {willHold && (
              <div
                role="status"
                className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
              >
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-300">
                    Va a revisión de compliance
                  </p>
                  <p className="text-muted-foreground">
                    Los montos de {formatUSD(1000)} o más se retienen y se
                    acreditan al destinatario recién cuando un administrador los
                    aprueba. El saldo se descuenta de tu cuenta al instante.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {willHold ? "Enviar a revisión" : "Enviar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
