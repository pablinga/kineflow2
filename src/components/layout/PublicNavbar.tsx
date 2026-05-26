"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";

const links = [
  { href: "#beneficios", label: "Beneficios" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#contacto", label: "Contacto" },
];

export function PublicNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-ocean-100 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Logo />
        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              className="text-sm font-medium text-slate-600 transition hover:text-ocean-700"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <LinkButton href="/login" variant="ghost">
            Ingresar
          </LinkButton>
          <LinkButton href="/registro">Registrarse</LinkButton>
        </div>
        <button
          aria-label="Abrir menú"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ocean-100 text-slate-700 md:hidden"
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
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-ocean-50"
                href={link.href}
                key={link.href}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <LinkButton className="w-full" href="/login" variant="secondary">
              Ingresar
            </LinkButton>
            <LinkButton className="w-full" href="/registro">
              Registrarse
            </LinkButton>
          </div>
        </div>
      ) : null}
    </header>
  );
}
