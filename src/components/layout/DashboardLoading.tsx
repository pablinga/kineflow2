import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

type DashboardLoadingProps = {
  error?: string;
  message?: string;
  retryHref?: string;
  title?: string;
};

export function DashboardLoading({
  error,
  message = "Estamos verificando tu sesion.",
  retryHref,
  title = "Preparando tu panel...",
}: DashboardLoadingProps) {
  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-lg border border-ocean-100 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">KineFlow</p>
            <h1 className="mt-2 text-2xl font-bold text-ink">
              {error ? "No pudimos verificar tu sesion" : title}
            </h1>
            <p className="mt-2 text-slate-600">{error ?? message}</p>
            {error ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <a
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                  href={retryHref ?? ""}
                >
                  Reintentar
                </a>
                <a
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                  href="/login"
                >
                  Ir al login
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
