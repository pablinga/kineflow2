import Link from "next/link";
import { Plus, type LucideIcon } from "lucide-react";

type MobileFabProps = {
  href: string;
  icon?: LucideIcon;
  label: string;
};

/**
 * Botón flotante de la acción principal de la pantalla, solo en el celular
 * (en escritorio la acción está en el encabezado). Queda arriba de la barra
 * inferior; PageContainer deja lugar abajo para que no tape contenido.
 */
export function MobileFab({ href, icon: Icon = Plus, label }: MobileFabProps) {
  return (
    <Link
      aria-label={label}
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-ocean-600 text-white shadow-[0_10px_24px_rgba(15,85,220,0.35)] transition-transform duration-150 ease-out active:scale-95 lg:hidden"
      href={href}
      prefetch={false}
      title={label}
    >
      <Icon className="h-7 w-7" strokeWidth={2.2} />
    </Link>
  );
}
