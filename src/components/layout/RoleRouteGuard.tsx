"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getSupabaseClient } from "@/lib/supabase";
import {
  isPathAllowedForRecepcion,
  isRecepcionWorkspace,
} from "@/lib/workspace-permissions";

/** Cuenta de recepción sin ninguna clínica activa (por ejemplo, dada de baja). */
function ReceptionAccessDisabled() {
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);

    try {
      await getSupabaseClient().auth.signOut();
    } finally {
      window.location.replace("/login");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ocean-50 px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-6 text-center shadow-card">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-6 text-xl font-bold text-ink">
          Tu acceso a la clínica está desactivado
        </h1>
        <p className="mt-2 text-sm text-slate-600">Contactá al administrador.</p>
        <Button className="mt-6" disabled={loggingOut} onClick={logout} type="button" variant="secondary">
          <LogOut className="h-4 w-4" />
          {loggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
        </Button>
      </div>
    </main>
  );
}

/**
 * Bloquea en el cliente las rutas del dashboard que un rol no puede abrir
 * (también por URL directa). La protección real sigue siendo la RLS y las
 * API routes; esto evita mostrar pantallas que no corresponden.
 */
export function RoleRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accountType, loading } = useRequireAuth();
  const { activeWorkspace, loaded, workspaces } = useActiveWorkspace();
  const receptionWithoutClinic =
    !loading &&
    loaded &&
    accountType === "RECEPCION" &&
    !workspaces.some(
      (workspace) => workspace.type === "CLINICA" && workspace.role === "RECEPCION",
    );
  const blocked =
    loaded &&
    !receptionWithoutClinic &&
    isRecepcionWorkspace(activeWorkspace) &&
    !isPathAllowedForRecepcion(pathname);

  useEffect(() => {
    if (blocked) {
      router.replace("/dashboard");
    }
  }, [blocked, router]);

  if (receptionWithoutClinic) {
    return <ReceptionAccessDisabled />;
  }

  if (blocked) {
    return (
      <DashboardLoading
        message="Esta sección no está disponible para recepción."
        title="Redirigiendo..."
      />
    );
  }

  return <>{children}</>;
}
