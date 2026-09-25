"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import {
  isPathAllowedForRecepcion,
  isRecepcionWorkspace,
} from "@/lib/workspace-permissions";

/**
 * Bloquea en el cliente las rutas del dashboard que un rol no puede abrir
 * (también por URL directa). La protección real sigue siendo la RLS y las
 * API routes; esto evita mostrar pantallas que no corresponden.
 */
export function RoleRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeWorkspace, loaded } = useActiveWorkspace();
  const blocked =
    loaded &&
    isRecepcionWorkspace(activeWorkspace) &&
    !isPathAllowedForRecepcion(pathname);

  useEffect(() => {
    if (blocked) {
      router.replace("/dashboard");
    }
  }, [blocked, router]);

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
