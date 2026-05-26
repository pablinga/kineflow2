import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

export function DashboardLoading() {
  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-lg border border-ocean-100 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">KineFlow</p>
            <h1 className="mt-2 text-2xl font-bold text-ink">
              Preparando tu panel...
            </h1>
            <p className="mt-2 text-slate-600">
              Estamos verificando tu sesión.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
