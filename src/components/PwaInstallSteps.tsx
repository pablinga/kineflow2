import type { InstallInstructions } from "@/lib/pwa-install-instructions";

/** Lista numerada de pasos y nota final; la comparten el modal y /instalar. */
export function PwaInstallSteps({
  instructions,
}: {
  instructions: Pick<InstallInstructions, "note" | "steps">;
}) {
  return (
    <>
      <ol className="mt-5 space-y-3">
        {instructions.steps.map((step, index) => (
          <li className="flex gap-3 text-sm text-slate-700" key={step}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ocean-500 text-xs font-bold text-white">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {instructions.note ? (
        <p className="mt-4 rounded-lg bg-ocean-50 px-3 py-2 text-xs font-medium text-slate-600">
          {instructions.note}
        </p>
      ) : null}
    </>
  );
}
