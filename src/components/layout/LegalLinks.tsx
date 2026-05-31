import Link from "next/link";

const legalLinks = [
  { href: "/terminos-y-condiciones", label: "Terminos y Condiciones" },
  { href: "/politica-de-privacidad", label: "Politica de Privacidad" },
  {
    href: "/politica-de-suscripcion-y-baja",
    label: "Suscripcion y baja",
  },
  { href: "/baja-de-servicio", label: "Baja de servicio" },
  { href: "/arrepentimiento", label: "Arrepentimiento" },
  { href: "/contacto-soporte", label: "Contacto soporte" },
];

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap gap-x-4 gap-y-2 ${className}`}>
      {legalLinks.map((link) => (
        <Link className="hover:text-ocean-700" href={link.href} key={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
