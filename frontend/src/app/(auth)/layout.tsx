"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Route to root, which redirects by role (admin -> /admin, user -> /dashboard).
    if (!loading && token) router.replace("/");
  }, [loading, token, router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Wallet className="size-6" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">MiniWallet</h1>
          <p className="text-sm text-muted-foreground">
            Transferencias con ledger de doble entrada
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
