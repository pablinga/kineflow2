"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CalendarDays,
  CreditCard,
  ChevronsUpDown,
  DollarSign,
  FileBarChart,
  Home,
  Loader2,
  LogOut,
  Menu,
  PanelLeftClose,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { SessionDefaultsNotificationBell } from "@/components/layout/SessionDefaultsNotificationBell";
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
import { resetAccessLevelSnapshot, useAccessLevel } from "@/hooks/useAccessLevel";
import {
  resetWorkspaceSnapshot,
  useActiveWorkspace,
  type WorkspaceType,
} from "@/hooks/useActiveWorkspace";
import { shouldShowClinicFeatures } from "@/lib/features";
import {
  getSelectableWorkspaces,
  isPathAllowedForRecepcion,
  isRecepcionWorkspace,
} from "@/lib/workspace-permissions";

const LOGOUT_TIMEOUT_MS = 5000;

// Título de la barra superior del celular para páginas internas que no son
// un ítem del menú (el resto muestra el nombre de su sección).
const mobileSubpageTitles: Record<string, string> = {
  "/dashboard/turnos/nuevo": "Nuevo turno",
};
const LOGOUT_REDIRECT_FALLBACK_MS = 800;

const navigation = {
  KINESIOLOGO: [
    { href: "/dashboard", label: "Inicio", icon: Home },
    { href: "/dashboard/pacientes", label: "Pacientes", icon: Users },
    { href: "/dashboard/turnos", label: "Agenda", icon: CalendarDays },
    {
      href: "/dashboard/disponibilidad",
      label: "Reservas online",
      icon: CalendarClock,
    },
    {
      href: "/dashboard/mis-consultorios",
      label: "Mis consultorios",
      icon: Building2,
    },
    { href: "/dashboard/ingresos", label: "Ingresos", icon: DollarSign },
    { href: "/dashboard/reportes", label: "Reportes", icon: FileBarChart },
    { href: "/dashboard/configuracion", label: "Configuración", icon: Settings },
    { href: "/dashboard/planes", label: "Plan", icon: CreditCard },
  ],
  CONSULTORIO: [
    { href: "/dashboard", label: "Inicio", icon: Home },
    { href: "/dashboard/pacientes", label: "Pacientes", icon: Users },
    { href: "/dashboard/equipo", label: "Equipo", icon: UsersRound },
    { href: "/dashboard/turnos", label: "Agenda", icon: CalendarDays },
    {
      href: "/dashboard/disponibilidad",
      label: "Reservas online",
      icon: CalendarClock,
    },
    { href: "/dashboard/ingresos", label: "Ingresos", icon: DollarSign },
    { href: "/dashboard/reportes", label: "Reportes", icon: FileBarChart },
    { href: "/dashboard/configuracion", label: "Configuración", icon: Settings },
    { href: "/dashboard/planes", label: "Plan", icon: CreditCard },
  ],
} satisfies Record<
  Exclude<AccountType, "RECEPCION">,
  Array<{ href: string; label: string; icon: typeof Home }>
>;

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
  const { accessLevel } = useAccessLevel();
  const {
    activeWorkspace,
    loaded: workspaceLoaded,
    selectWorkspace,
    workspaces,
  } = useActiveWorkspace();
  // Una cuenta RECEPCION solo trabaja en clínicas: usa el menú de la clínica.
  const effectiveAccountType =
    activeWorkspace?.type === "CLINICA" || accountType === "RECEPCION"
      ? "CONSULTORIO"
      : accountType;
  const isRecepcion =
    isRecepcionWorkspace(activeWorkspace) || accountType === "RECEPCION";
  const selectableWorkspaces = getSelectableWorkspaces(workspaces, accountType);
  const mobileNavigationOrder = isRecepcion
    ? [
        "/dashboard",
        "/dashboard/turnos",
        "/dashboard/pacientes",
      ]
    : effectiveAccountType === "CONSULTORIO"
      ? [
          "/dashboard",
          "/dashboard/turnos",
          "/dashboard/pacientes",
          "/dashboard/equipo",
        ]
      : [
          "/dashboard",
          "/dashboard/turnos",
          "/dashboard/pacientes",
          "/dashboard/ingresos",
        ];
  const isClinicAdmin =
    activeWorkspace?.type === "CLINICA" && activeWorkspace.role === "ADMIN";
  const baseNavigation =
    effectiveAccountType === "KINESIOLOGO" &&
    plan.plan !== "INDEPENDIENTE" &&
    accessLevel !== "TRIAL_ACTIVE"
      ? navigation.KINESIOLOGO.filter(
          (item) => item.href !== "/dashboard/ingresos",
        )
      : navigation[effectiveAccountType];
  // Recepción: el menú de la clínica sin Configuración, Reportes, Ingresos,
  // Equipo ni Plan (misma regla que el guard de rutas).
  const roleNavigation = isRecepcion
    ? baseNavigation.filter((item) => isPathAllowedForRecepcion(item.href))
    : isClinicAdmin
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
      resetAccessLevelSnapshot();
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
        resetAccessLevelSnapshot();
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
    if (pathname === href) {
      return true;
    }

    if (href === "/dashboard" || !pathname.startsWith(`${href}/`)) {
      return false;
    }

    const hasMoreSpecificMatch = visibleNavigation.some(
      (item) =>
        item.href !== href &&
        item.href.length > href.length &&
        (pathname === item.href || pathname.startsWith(`${item.href}/`)),
    );

    return !hasMoreSpecificMatch;
  }

  // Celular: barra superior con el nombre de la pantalla (y flecha para
  // volver en las páginas internas) y barra inferior con "Más" para el resto
  // del menú, como una app.
  const activeItem = visibleNavigation.find((item) => isActive(item.href));
  const isSubpage = Boolean(activeItem && pathname !== activeItem.href);
  const mobileTitle = mobileSubpageTitles[pathname] ?? activeItem?.label;
  const moreActive =
    open || !visibleMobileNavigation.some((item) => isActive(item.href));

  return (
    <>
      <div className="sticky top-0 z-40 flex min-h-14 items-center gap-1 border-b border-ocean-100 bg-white px-2 py-1.5 lg:hidden">
        {activeItem && isSubpage ? (
          <Link
            aria-label={`Volver a ${activeItem.label}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 transition-colors duration-150 ease-out active:bg-ocean-100"
            href={activeItem.href}
            prefetch={false}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : null}
        {mobileTitle ? (
          <p
            className={`min-w-0 flex-1 truncate text-xl font-bold text-ink ${
              isSubpage ? "" : "pl-2"
            }`}
          >
            {mobileTitle}
          </p>
        ) : (
          <div className="flex-1 pl-2">
            <Logo compact />
          </div>
        )}
        {isRecepcion ? null : <SessionDefaultsNotificationBell />}
      </div>
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-ocean-100 bg-white p-5 shadow-soft transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-screen lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between">
          <Logo showSlogan />
          <div className="flex items-center gap-1">
            <span className="hidden lg:block">
              {isRecepcion ? null : <SessionDefaultsNotificationBell />}
            </span>
            <button
              aria-label="Cerrar navegación"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors duration-150 ease-out hover:bg-ocean-50 active:scale-95 lg:hidden"
              onClick={() => setOpen(false)}
              type="button"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!loading && workspaceLoaded && workspaces.length > 0 ? (
            <div className="mb-5">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-400">
                Espacio
              </label>
              {selectableWorkspaces.length > 1 ? (
                <div className="relative mt-2">
                  <select
                    className="min-h-11 w-full appearance-none rounded-lg border border-ocean-100 bg-ocean-50 px-3 pr-10 text-sm font-semibold text-ink outline-none transition focus:border-ocean-400"
                    onChange={(event) => selectWorkspace(event.target.value)}
                    value={activeWorkspace?.id ?? ""}
                  >
                    {selectableWorkspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name} - {getWorkspaceTypeLabel(workspace.type)}
                        {isRecepcionWorkspace(workspace) ? " (recepción)" : ""}
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
          <nav className="space-y-1">
            {visibleNavigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <Link
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 ease-out ${
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
          <PwaInstallButton className="mt-1 lg:hidden" source="menu" />
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
        </div>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ocean-100 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur lg:hidden">
        <div
          className="mx-auto grid max-w-lg"
          style={{
            gridTemplateColumns: `repeat(${visibleMobileNavigation.length + 1}, minmax(0, 1fr))`,
          }}
        >
          {visibleMobileNavigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 text-[0.7rem] transition-colors duration-150 ease-out ${
                  active ? "font-bold text-ocean-800" : "font-semibold text-slate-500"
                }`}
                href={item.href}
                key={item.href}
                prefetch={false}
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150 ease-out ${
                    active ? "bg-ocean-100" : ""
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            aria-expanded={open}
            aria-label="Más opciones del menú"
            className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 text-[0.7rem] transition-colors duration-150 ease-out ${
              moreActive ? "font-bold text-ocean-800" : "font-semibold text-slate-500"
            }`}
            onClick={() => setOpen(true)}
            type="button"
          >
            <span
              className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150 ease-out ${
                moreActive ? "bg-ocean-100" : ""
              }`}
            >
              <Menu className="h-5 w-5" />
            </span>
            <span>Más</span>
          </button>
        </div>
      </nav>
      {open ? (
        <button
          aria-label="Cerrar navegación"
          className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm transition-opacity duration-200 lg:hidden"
          onClick={() => setOpen(false)}
          type="button"
        />
      ) : null}
    </>
  );
}
