"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, user, loading, logout } = useAuth();
  const router = useRouter();

  // Client-side guard (UX only — the API enforces auth on every request).
  useEffect(() => {
    if (!loading && !token) router.replace("/login");
  }, [loading, token, router]);

  if (loading || !token) {
    return (
      <div className="mx-auto w-full max-w-lg flex-1 space-y-4 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Wallet className="size-5 text-primary" aria-hidden />
          <span className="text-base font-semibold">MiniWallet</span>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.name}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            aria-label="Cerrar sesión"
          >
            <LogOut className="size-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4">{children}</main>

      <BottomNav />
    </div>
  );
}
