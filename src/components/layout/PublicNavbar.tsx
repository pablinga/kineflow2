"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { areSignupsEnabled } from "@/lib/signups";

const links = [
  { href: "#beneficios", label: "Beneficios" },
  { href: "#planes", label: "Plan" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#contacto", label: "Contacto" },
];

export function PublicNavbar() {
  const [open, setOpen] = useState(false);
  const signupsEnabled = areSignupsEnabled();

  return (
    <header className="sticky top-0 z-50 border-b border-ocean-100 bg-white/92 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Logo showSlogan />
        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              className="text-sm font-semibold text-slate-600 transition hover:text-ocean-600"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          {signupsEnabled ? (
            <LinkButton href="/login" variant="ghost">
              Ingresar
            </LinkButton>
          ) : null}
          {signupsEnabled ? (
            <LinkButton href="/registro">Comenzar ahora</LinkButton>
          ) : null}
        </div>
        <button
          aria-label="Abrir menu"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-ocean-100 bg-white text-slate-700 md:hidden"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open ? (
        <div className="border-t border-ocean-100 bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {links.map((link) => (
              <a
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-ocean-50"
                href={link.href}
                key={link.href}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            {signupsEnabled ? (
              <LinkButton className="w-full" href="/login" variant="secondary">
                Ingresar
              </LinkButton>
            ) : null}
            {signupsEnabled ? (
              <LinkButton className="w-full" href="/registro">
                Comenzar ahora
              </LinkButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
