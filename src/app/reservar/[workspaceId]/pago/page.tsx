import type { Metadata } from "next";
import { DepositReturnClient } from "./DepositReturnClient";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: { absolute: "Pago de la seña | KineFlow" },
};

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

// Vuelta del checkout de Mercado Pago (éxito, pendiente o error): muestra el
// estado real del turno, no el que dice la URL.
export default async function DepositReturnPage({ params }: PageProps) {
  const { workspaceId } = await params;

  return (
    <main className="min-h-screen bg-ocean-50 px-4 py-10 text-ink">
      <div className="mx-auto max-w-lg">
        <DepositReturnClient workspaceId={workspaceId} />
      </div>
    </main>
  );
}
