"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import {
  DEFAULT_SESSION_DURATION_MINUTES,
  DEFAULT_SESSION_PRICE,
} from "@/lib/session-defaults";

const STORAGE_KEY = "kineflow.notifications.sessionDefaults.seen";

export function SessionDefaultsNotificationBell() {
  const [seen, setSeen] = useState(true);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      setSeen(true);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleToggle() {
    setOpen((current) => !current);

    if (!seen) {
      setSeen(true);
      try {
        window.localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // El aviso simplemente no queda marcado como visto; no es crítico.
      }
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-label="Notificaciones"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-ocean-50 hover:text-ocean-800"
        onClick={handleToggle}
        type="button"
      >
        <Bell className="h-5 w-5" />
        {!seen ? (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-72 rounded-lg border border-ocean-100 bg-white p-4 shadow-card">
          <p className="text-sm font-bold text-ink">
            Costo y duración de sesión por defecto
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Configuramos un costo de{" "}
            <strong>{formatCurrency(DEFAULT_SESSION_PRICE)}</strong> y una
            duración de <strong>{DEFAULT_SESSION_DURATION_MINUTES} min</strong>{" "}
            por defecto para tus turnos. Podés ajustarlos cuando quieras.
          </p>
          <Link
            className="mt-3 inline-flex text-sm font-semibold text-ocean-700 underline-offset-4 hover:underline"
            href="/dashboard/configuracion"
            onClick={() => setOpen(false)}
            prefetch={false}
          >
            Ir a Configuración →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
