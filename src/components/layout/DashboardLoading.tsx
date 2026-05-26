import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

type DashboardLoadingProps = {
  error?: string;
  message?: string;
  title?: string;
};

export function DashboardLoading({
  error,
  message = "Estamos verificando tu sesión.",
  title = "Preparando tu panel...",
}: DashboardLoadingProps) {
  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-lg border border-ocean-100 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">KineFlow</p>
            <h1 className="mt-2 text-2xl font-bold text-ink">
              {error ? "No pudimos verificar tu sesión" : title}
            </h1>
            <p className="mt-2 text-slate-600">{error ?? message}</p>
            {error ? (
              <a
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                href="/login"
              >
                Ir al login
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
