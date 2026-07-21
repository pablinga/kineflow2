import Link from "next/link";

export const legalLinks = [
  { href: "/terminos-y-condiciones", label: "Términos y Condiciones" },
  { href: "/politica-de-privacidad", label: "Política de Privacidad" },
  {
    href: "/suscripciones-cancelaciones-y-reembolsos",
    label: "Suscripciones, Cancelaciones y Reembolsos",
  },
  { href: "/arrepentimiento", label: "Derecho de Arrepentimiento" },
];

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap gap-x-4 gap-y-2 ${className}`}>
      {legalLinks.map((link) => (
        <Link
          className="hover:text-ocean-700"
          href={link.href}
          key={link.href}
          prefetch={false}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
