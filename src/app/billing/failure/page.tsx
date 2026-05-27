import Link from "next/link";
import { XCircle } from "lucide-react";

export default function BillingFailurePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ocean-50 px-4">
      <section className="w-full max-w-lg rounded-lg border border-ocean-100 bg-white p-6 text-center shadow-sm">
        <XCircle className="mx-auto h-10 w-10 text-rose-600" />
        <h1 className="mt-4 text-2xl font-bold text-ink">
          No se pudo activar
        </h1>
        <p className="mt-3 leading-6 text-slate-600">
          No pudimos activar tu plan. Podés intentarlo nuevamente o elegir otro
          medio de pago.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white"
          href="/dashboard/planes"
        >
          Volver a planes
        </Link>
      </section>
    </main>
  );
}
