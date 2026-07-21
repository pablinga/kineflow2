"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  CreditCard,
  ChevronsUpDown,
  Home,
  Loader2,
  LogOut,
  Menu,
  PanelLeftClose,
  Users,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { getSupabaseClient } from "@/lib/supabase";
import {
  resetAuthSnapshot,
  useRequireAuth,
  type AccountType,
} from "@/hooks/useRequireAuth";
import {
  resetSubscriptionPlanSnapshot,
  useSubscriptionPlan,
} from "@/hooks/useSubscriptionPlan";
import {
  resetWorkspaceSnapshot,
  useActiveWorkspace,
  type WorkspaceType,
} from "@/hooks/useActiveWorkspace";
import { shouldShowClinicFeatures } from "@/lib/features";

const LOGOUT_TIMEOUT_MS = 5000;
const LOGOUT_REDIRECT_FALLBACK_MS = 800;

const navigation = {
  KINESIOLOGO: [
    { href: "/dashboard", label: "Inicio", icon: Home },
    { href: "/dashboard/pacientes", label: "Pacientes", icon: Users },
    { href: "/dashboard/turnos", label: "Agenda", icon: CalendarDays },
    {
      href: "/dashboard/mis-consultorios",
      label: "Mis consultorios",
      icon: Building2,
    },
    { href: "/dashboard/ingresos", label: "Ingresos", icon: WalletCards },
    { href: "/dashboard/planes", label: "Plan", icon: CreditCard },
  ],
  CONSULTORIO: [
    { href: "/dashboard", label: "Inicio", icon: Home },
    { href: "/dashboard/pacientes", label: "Pacientes", icon: Users },
    { href: "/dashboard/equipo", label: "Equipo", icon: UsersRound },
    { href: "/dashboard/turnos", label: "Agenda", icon: CalendarDays },
    { href: "/dashboard/ingresos", label: "Ingresos", icon: WalletCards },
    { href: "/dashboard/planes", label: "Plan", icon: CreditCard },
  ],
} satisfies Record<
  AccountType,
  Array<{ href: string; label: string; icon: typeof Home }>
>;

const mobileNavigationOrder = [
  "/dashboard",
  "/dashboard/turnos",
  "/dashboard/pacientes",
  "/dashboard/planes",
];

function clearSupabaseLocalSession() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("sb-") && key.includes("auth-token"))
      .forEach((key) => window.localStorage.removeItem(key));
    Object.keys(window.sessionStorage)
      .filter((key) => key.startsWith("sb-") && key.includes("auth-token"))
      .forEach((key) => window.sessionStorage.removeItem(key));
  } catch (error) {
    console.warn("[logout] Could not clear local auth storage", error);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("logout_timeout")), timeoutMs);
    }),
  ]);
}

function getWorkspaceTypeLabel(type: WorkspaceType) {
  return type === "CLINICA" ? "Clínica" : "Personal";
}

export function DashboardSidebar() {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const { accountType, loading } = useRequireAuth();
  const { plan } = useSubscriptionPlan();
  const {
    activeWorkspace,
    loaded: workspaceLoaded,
    selectWorkspace,
    workspaces,
  } = useActiveWorkspace();
  const effectiveAccountType =
    activeWorkspace?.type === "CLINICA" ? "CONSULTORIO" : accountType;
  const isClinicAdmin =
    activeWorkspace?.type === "CLINICA" && activeWorkspace.role === "ADMIN";
  const baseNavigation =
    effectiveAccountType === "KINESIOLOGO" && plan.plan !== "INDEPENDIENTE"
      ? navigation.KINESIOLOGO.filter(
          (item) => item.href !== "/dashboard/ingresos",
        )
      : navigation[effectiveAccountType];
  const roleNavigation = isClinicAdmin
    ? baseNavigation
    : baseNavigation.filter(
        (item) =>
          !["/dashboard/equipo", "/dashboard/kinesiologos"].includes(
            item.href,
          ),
      );
  const visibleNavigation = shouldShowClinicFeatures()
    ? roleNavigation
    : roleNavigation.filter(
        (item) =>
          ![
            "/dashboard/mis-consultorios",
            "/dashboard/consultorios",
            "/dashboard/kinesiologos",
          ].includes(item.href),
      );
  const visibleMobileNavigation = mobileNavigationOrder
    .map((href) => visibleNavigation.find((item) => item.href === href))
    .filter((item): item is (typeof visibleNavigation)[number] =>
      Boolean(item),
    );

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setLogoutError("");

    try {
      const supabase = getSupabaseClient();
      const { error } = await withTimeout(
        supabase.auth.signOut(),
        LOGOUT_TIMEOUT_MS,
      );

      if (error) {
        throw error;
      }

      console.info("[logout] Supabase signOut completed");
      resetAuthSnapshot();
      resetSubscriptionPlanSnapshot();
      resetWorkspaceSnapshot();
      clearSupabaseLocalSession();
      router.replace("/login");
      window.setTimeout(() => {
        if (window.location.pathname !== "/login") {
          window.location.replace("/login");
        }
      }, LOGOUT_REDIRECT_FALLBACK_MS);
    } catch (error) {
      if (error instanceof Error && error.message === "logout_timeout") {
        console.warn(
          "[logout] Supabase signOut timed out; redirecting with local cleanup",
        );
        resetAuthSnapshot();
        resetSubscriptionPlanSnapshot();
        resetWorkspaceSnapshot();
        clearSupabaseLocalSession();
        window.location.replace("/login");
        return;
      }

      console.error("[logout] Supabase signOut failed", error);
      setLogoutError("No pudimos cerrar sesión. Intentá nuevamente.");
      setLoggingOut(false);
    }
  }

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-ocean-100 bg-white px-4 py-3 lg:hidden">
        <Logo compact />
        <button
          aria-label="Abrir navegacion"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ocean-100 text-slate-700"
          onClick={() => setOpen(true)}
          type="button"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-ocean-100 bg-white p-5 shadow-soft transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:block lg:h-screen lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between">
          <Logo showSlogan />
          <button
            aria-label="Cerrar navegacion"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-ocean-50 lg:hidden"
            onClick={() => setOpen(false)}
            type="button"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        </div>
        {!loading && workspaceLoaded && workspaces.length > 0 ? (
          <div className="mb-5">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-400">
              Espacio
            </label>
            {workspaces.length > 1 ? (
              <div className="relative mt-2">
                <select
                  className="min-h-11 w-full appearance-none rounded-lg border border-ocean-100 bg-ocean-50 px-3 pr-10 text-sm font-semibold text-ink outline-none transition focus:border-ocean-400"
                  onChange={(event) => selectWorkspace(event.target.value)}
                  value={activeWorkspace?.id ?? ""}
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name} - {getWorkspaceTypeLabel(workspace.type)}
                    </option>
                  ))}
                </select>
                <ChevronsUpDown className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-ocean-700" />
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-ocean-100 bg-ocean-50 px-3 py-3">
                <p className="truncate text-sm font-bold text-ink">
                  {activeWorkspace?.name}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-ocean-700">
                  {activeWorkspace
                    ? getWorkspaceTypeLabel(activeWorkspace.type)
                    : ""}
                </p>
              </div>
            )}
          </div>
        ) : null}
        <nav className="hidden space-y-1 lg:block">
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-ocean-500 text-white shadow-soft"
                    : "text-slate-600 hover:bg-ocean-50 hover:text-ocean-800"
                }`}
                href={item.href}
                key={item.label}
                onClick={() => setOpen(false)}
                prefetch={false}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 lg:hidden">
          <p className="px-1 text-xs font-bold uppercase tracking-wide text-slate-400">
            Cuenta
          </p>
          <Link
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-ocean-50 hover:text-ocean-800"
            href="/dashboard/planes"
            onClick={() => setOpen(false)}
            prefetch={false}
          >
            <CreditCard className="h-5 w-5" />
            Mi plan
          </Link>
        </div>
        <button
          className={`mt-5 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-80 lg:mt-8 ${
            loggingOut
              ? "bg-ocean-50 text-ocean-800"
              : "text-slate-600 hover:bg-ocean-50 hover:text-ocean-800"
          }`}
          disabled={loggingOut}
          onClick={handleLogout}
          type="button"
        >
          {loggingOut ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <LogOut className="h-5 w-5" />
          )}
          {loggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
        </button>
        {logoutError ? (
          <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {logoutError}
          </p>
        ) : null}
      </aside>
      {visibleMobileNavigation.length > 0 ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ocean-100 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-soft backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
            {visibleMobileNavigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <Link
                  className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-lg px-1 text-[0.68rem] font-semibold transition ${
                    active
                      ? "bg-ocean-50 text-ocean-700"
                      : "text-slate-500 hover:bg-ocean-50 hover:text-ocean-700"
                  }`}
                        href={item.href}
                        key={item.href}
                        prefetch={false}
                      >
                  <Icon className="h-5 w-5" />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
      {open ? (
        <button
          aria-label="Cerrar navegacion"
          className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm transition-opacity duration-200 lg:hidden"
          onClick={() => setOpen(false)}
          type="button"
        />
      ) : null}
    </>
  );
}
