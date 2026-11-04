/**
 * Esqueletos de carga con la forma de cada pantalla principal, para que al
 * llegar los datos el contenido aparezca en su lugar sin "saltar".
 * Se muestran dentro del mismo PageContainer que la pantalla real.
 */

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-ocean-100 ${className}`} />;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

/** Encabezado de escritorio (en el celular el título va en la barra superior). */
function DesktopHeader({ actions = 2 }: { actions?: number }) {
  return (
    <div className="hidden rounded-lg border border-ocean-100 bg-white p-6 shadow-card lg:flex lg:items-center lg:justify-between">
      <div>
        <Bar className="h-4 w-24" />
        <Bar className="mt-3 h-8 w-56" />
      </div>
      <div className="flex gap-3">
        {Array.from({ length: actions }, (_, index) => (
          <Bar className="h-11 w-36 rounded-lg" key={index} />
        ))}
      </div>
    </div>
  );
}

export function InicioSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="lg:rounded-lg lg:border lg:border-ocean-100 lg:bg-white lg:p-6 lg:shadow-card">
        <Bar className="h-4 w-40" />
        <Bar className="mt-3 h-9 w-48" />
        <Bar className="mt-3 h-4 w-full max-w-md" />
        <div className="mt-5 grid gap-3 sm:flex">
          <Bar className="h-11 rounded-lg sm:w-44" />
          <Bar className="h-11 rounded-lg bg-ocean-200 sm:w-44" />
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="lg:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between">
            <Bar className="h-6 w-36" />
            <Bar className="h-4 w-20" />
          </div>
          <div className="mt-5 space-y-5">
            {[1, 2, 3].map((item) => (
              <div className="flex gap-4" key={item}>
                <Bar className="h-5 w-12" />
                <div className="flex-1 space-y-2">
                  <Bar className="h-5 w-40" />
                  <Bar className="h-4 w-52 bg-ocean-50" />
                  <div className="flex gap-2 pt-1">
                    <Bar className="h-11 w-28 rounded-lg bg-ocean-50" />
                    <Bar className="h-11 w-28 rounded-lg bg-ocean-50" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((item) => (
            <Card key={item}>
              <Bar className="h-4 w-24" />
              <Bar className="mt-4 h-8 w-16" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgendaRowSkeleton() {
  return (
    <div className="flex gap-4 border-b border-ocean-100 py-4 last:border-b-0">
      <div className="w-12 shrink-0 space-y-2">
        <Bar className="h-5 w-12" />
        <Bar className="h-3 w-10 bg-ocean-50" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <Bar className="h-5 w-44" />
        <div className="flex gap-2">
          <Bar className="h-6 w-20 rounded-full bg-ocean-50" />
          <Bar className="h-6 w-36 bg-ocean-50" />
        </div>
        <Bar className="h-11 w-28 rounded-full bg-ocean-50" />
      </div>
    </div>
  );
}

export function AgendaSkeleton() {
  return (
    <>
      {/* Celular: vista Día (fecha, Día/Semana/Mes, tira de días, filtros y turnos). */}
      <div className="lg:hidden">
        <div className="-mx-4 -mt-4 border-b border-ocean-100 bg-white px-4 pb-3 pt-3 sm:-mx-6 sm:-mt-6 sm:px-6">
          <div className="flex items-center justify-between">
            <Bar className="h-5 w-44" />
            <Bar className="h-5 w-10" />
          </div>
          <Bar className="mt-4 h-11 w-full rounded-full bg-ocean-50" />
          <div className="mt-4 flex justify-between px-6">
            {[1, 2, 3, 4, 5, 6, 7].map((item) => (
              <div className="flex flex-col items-center gap-2" key={item}>
                <Bar className="h-3 w-3 bg-ocean-50" />
                <Bar className="h-6 w-6" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2 py-3">
          {[1, 2, 3].map((item) => (
            <Bar className="h-10 w-24 rounded-full bg-white" key={item} />
          ))}
        </div>
        <div className="-mx-4 bg-white px-4 sm:-mx-6 sm:px-6">
          {[1, 2, 3, 4].map((item) => (
            <AgendaRowSkeleton key={item} />
          ))}
        </div>
      </div>

      {/* Escritorio: encabezado con controles y el calendario. */}
      <div className="hidden space-y-6 lg:block">
        <DesktopHeader actions={3} />
        <Card className="py-3 sm:py-3">
          <Bar className="h-4 w-72 bg-ocean-50" />
        </Card>
        <Card>
          <div className="flex gap-4">
            <Bar className="h-11 w-24 bg-ocean-50" />
            <Bar className="h-11 flex-1 rounded-lg bg-ocean-50" />
            <Bar className="h-11 flex-1 rounded-lg bg-ocean-50" />
          </div>
          <Bar className="mt-4 h-6 w-2/3 rounded-full bg-ocean-50" />
        </Card>
        <Card className="p-0 sm:p-0">
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: 21 }, (_, index) => (
              <div className="h-24 border-b border-r border-ocean-100 p-2" key={index}>
                <Bar className="h-4 w-6" />
                <Bar className="mt-3 h-5 w-full bg-ocean-50" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

export function PacientesSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <DesktopHeader />
      <div className="grid gap-3 lg:hidden">
        <Bar className="h-12 rounded-lg bg-white" />
        <Bar className="h-12 rounded-lg bg-ocean-200" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <Bar className="h-14 rounded-lg bg-white lg:h-11" />
        <Bar className="h-12 rounded-lg bg-white lg:h-11" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <Card key={item}>
            <div className="flex gap-4">
              <Bar className="h-12 w-12 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bar className="h-5 w-40" />
                <Bar className="h-4 w-48 bg-ocean-50" />
                <Bar className="h-7 w-20 rounded-full bg-ocean-50" />
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <Bar className="h-4 w-44 bg-ocean-50" />
              <Bar className="h-4 w-52 bg-ocean-50" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function IngresosSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Encabezado con el total cobrado. */}
      <Card className="lg:p-6">
        <Bar className="h-4 w-20" />
        <Bar className="mt-3 h-8 w-60" />
        <Bar className="mt-3 h-4 w-full max-w-sm bg-ocean-50" />
        <Bar className="mt-3 h-4 w-48 bg-ocean-50" />
        <div className="mt-5 rounded-lg bg-emerald-50 p-4 lg:max-w-xs">
          <Bar className="h-4 w-28 bg-emerald-100" />
          <Bar className="mt-3 h-7 w-36 bg-emerald-100" />
        </div>
      </Card>
      {/* Filtros. */}
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item}>
              <Bar className="h-4 w-24 bg-ocean-50" />
              <Bar className="mt-2 h-11 rounded-lg bg-ocean-50" />
            </div>
          ))}
        </div>
      </Card>
      {/* Cobros. */}
      <Card>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((item) => (
            <div className="flex items-center justify-between gap-4" key={item}>
              <div className="space-y-2">
                <Bar className="h-5 w-40" />
                <Bar className="h-4 w-28 bg-ocean-50" />
              </div>
              <Bar className="h-6 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
