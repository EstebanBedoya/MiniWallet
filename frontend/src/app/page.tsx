"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function RootPage() {
  const { token, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    // Admins have no wallet — land them on the compliance panel.
    router.replace(isAdmin ? "/admin" : "/dashboard");
  }, [loading, token, isAdmin, router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando" />
    </div>
  );
}
