import { LegalPage } from "@/components/layout/LegalPage";

export default function SubscriptionPolicyPage() {
  return (
    <LegalPage
      intro="Condiciones iniciales de KineFlow - Particular y su procedimiento de baja."
      sections={[
        {
          title: "KineFlow - Particular",
          body: "KineFlow - Particular es una suscripción recurrente para kinesiólogos independientes. La renovación se gestiona mediante Mercado Pago.",
        },
        {
          title: "Activacion",
          body: "La activacion del plan ocurre solo cuando KineFlow confirma desde backend el estado real aprobado o autorizado informado por Mercado Pago.",
        },
        {
          title: "Baja",
          body: "El usuario puede solicitar la baja desde KineFlow en la seccion Plan / Suscripcion. KineFlow registrara una referencia de gestion.",
        },
      ]}
      title="Política de Suscripción y Baja"
    />
  );
}
