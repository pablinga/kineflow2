"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarDays,
  Home,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  Settings,
  Users,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const navigation = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/dashboard", label: "Pacientes", icon: Users },
  { href: "/dashboard", label: "Turnos", icon: CalendarDays },
  { href: "/dashboard", label: "Evoluciones", icon: MessageSquareText },
  { href: "/dashboard", label: "Ajustes", icon: Settings },
];

export function DashboardSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-ocean-100 bg-white px-4 py-3 lg:hidden">
        <Logo />
        <button
          aria-label="Abrir navegación"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ocean-100 text-slate-700"
          onClick={() => setOpen(true)}
          type="button"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-ocean-100 bg-white p-5 transition lg:sticky lg:top-0 lg:block lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <button
            aria-label="Cerrar navegación"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-ocean-50 lg:hidden"
            onClick={() => setOpen(false)}
            type="button"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1">
          {navigation.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition ${
                  index === 0
                    ? "bg-ocean-600 text-white shadow-soft"
                    : "text-slate-600 hover:bg-ocean-50 hover:text-ocean-800"
                }`}
                href={item.href}
                key={item.label}
                onClick={() => setOpen(false)}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 rounded-lg border border-ocean-100 bg-ocean-50 p-4">
          <p className="text-sm font-semibold text-ocean-900">Plan clínica</p>
          <p className="mt-1 text-sm text-slate-600">
            42 pacientes activos y seguimiento ilimitado.
          </p>
        </div>
      </aside>
      {open ? (
        <button
          aria-label="Cerrar navegación"
          className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
          onClick={() => setOpen(false)}
          type="button"
        />
      ) : null}
    </>
  );
}
