import Link from "next/link";
import { Clock3 } from "lucide-react";

export default function BillingPendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ocean-50 px-4">
      <section className="w-full max-w-lg rounded-lg border border-ocean-100 bg-white p-6 text-center shadow-sm">
        <Clock3 className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="mt-4 text-2xl font-bold text-ink">Pago pendiente</h1>
        <p className="mt-3 leading-6 text-slate-600">
          Tu pago está pendiente. Te avisaremos cuando se confirme.
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
