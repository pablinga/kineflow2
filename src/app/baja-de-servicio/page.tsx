import { LegalPage } from "@/components/layout/LegalPage";

export default function CancellationPage() {
  return (
    <LegalPage
      intro="Procedimiento inicial para solicitar la baja del servicio."
      sections={[
        {
          title: "Solicitud desde KineFlow",
          body: "La baja de KineFlow - Particular debe poder solicitarse desde la cuenta del usuario, en la seccion Plan / Suscripcion.",
        },
        {
          title: "Confirmacion",
          body: "Al confirmar la baja, KineFlow intentará cancelar la suscripción en Mercado Pago y registrará la fecha y una referencia de gestión.",
        },
        {
          title: "Soporte",
          body: "Ante inconvenientes, el usuario puede contactar a soporte para revisar el estado de su solicitud.",
        },
      ]}
      title="Baja de Servicio"
    />
  );
}
