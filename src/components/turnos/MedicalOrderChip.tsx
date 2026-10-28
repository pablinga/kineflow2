import {
  type AppointmentOrderInfo,
  getAppointmentOrderLabel,
} from "@/lib/medical-orders";

/** Chip del turno: "Sesión 3 de 10", "Sin orden vigente" o "Fuera de orden". */
export function MedicalOrderChip({
  info,
  size = "sm",
}: {
  info: AppointmentOrderInfo | undefined;
  size?: "xs" | "sm";
}) {
  const label = getAppointmentOrderLabel(info);

  if (!info || !label) {
    return null;
  }

  const lastSession =
    info.kind === "covered" && info.sessionNumber >= info.authorizedSessions - 1;
  const tone =
    info.kind === "covered"
      ? lastSession
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : "bg-orange-50 text-orange-800 ring-orange-200";

  return (
    <span
      className={`w-fit whitespace-nowrap rounded-full px-2 py-1 font-semibold ring-1 ${tone} ${
        size === "xs" ? "text-[0.62rem]" : "text-xs"
      }`}
      title={
        info.kind === "covered"
          ? "Sesión de la orden médica"
          : info.kind === "exceeded"
            ? "La orden ya usó todas sus sesiones"
            : "El paciente no tiene una orden vigente de esta cobertura"
      }
    >
      {label}
    </span>
  );
}
