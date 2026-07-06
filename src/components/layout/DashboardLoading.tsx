import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

type DashboardLoadingProps = {
  error?: string;
  message?: string;
  retryHref?: string;
  title?: string;
};

export function DashboardLoading({
  error,
  message = "Estamos verificando tu sesión.",
  retryHref,
  title = "Cargando contenido",
}: DashboardLoadingProps) {
  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {error ? (
            <div className="rounded-lg border border-ocean-100 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-ocean-700">KineFlow</p>
              <h1 className="mt-2 text-2xl font-bold text-ink">
                No pudimos verificar tu sesión
              </h1>
              <p className="mt-2 text-slate-600">{error}</p>
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
            </div>
          ) : (
            <div aria-label={title} className="space-y-6">
              <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
                <div className="h-4 w-24 animate-pulse rounded bg-ocean-100" />
                <div className="mt-3 h-8 w-full max-w-sm animate-pulse rounded bg-ocean-100" />
                <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-ocean-50" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card"
                    key={item}
                  >
                    <div className="h-4 w-28 animate-pulse rounded bg-ocean-100" />
                    <div className="mt-4 h-7 w-20 animate-pulse rounded bg-ocean-50" />
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
                <div className="h-5 w-40 animate-pulse rounded bg-ocean-100" />
                <div className="mt-5 space-y-3">
                  {[1, 2, 3, 4].map((item) => (
                    <div
                      className="h-12 animate-pulse rounded bg-ocean-50"
                      key={item}
                    />
                  ))}
                </div>
              </div>
              <span className="sr-only">{message}</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
