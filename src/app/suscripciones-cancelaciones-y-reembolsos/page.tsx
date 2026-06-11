import { LegalPage } from "@/components/layout/LegalPage";

const updatedAt = "11 de junio de 2026";

export default function SubscriptionRefundsPage() {
  return (
    <LegalPage
      intro="Condiciones aplicables a los planes, cancelaciones y reembolsos de KineFlow."
      sections={[
        {
          title: "1. Planes",
          body: [
            "KineFlow podrá ofrecer planes gratuitos y pagos.",
            "Las características y precios vigentes serán publicados en la plataforma.",
          ],
        },
        {
          title: "2. Renovación automática",
          body: "Las suscripciones se renuevan automáticamente hasta que el usuario solicite su cancelación.",
        },
        {
          title: "3. Procesamiento de pagos",
          body: [
            "Los pagos son procesados mediante Mercado Pago.",
            "KineFlow no almacena información completa de tarjetas de crédito ni medios de pago.",
          ],
        },
        {
          title: "4. Activación",
          body: "La activación del plan se realizará una vez que KineFlow reciba confirmación válida del proveedor de pagos.",
        },
        {
          title: "5. Cancelación",
          body: [
            "La cancelación podrá solicitarse desde:",
            "Perfil",
            "Plan / Suscripción",
            "contacto@kineflow.ar",
          ],
        },
        {
          title: "6. Efectos de la cancelación",
          body: [
            "La cancelación evitará futuras renovaciones.",
            "El acceso continuará disponible hasta la finalización del período ya abonado.",
          ],
        },
        {
          title: "7. Reembolsos",
          body: [
            "Los pagos no son reembolsables salvo:",
            "Cobros duplicados.",
            "Errores atribuibles a KineFlow.",
            "Obligaciones legales aplicables.",
            "Decisión comercial expresa de KineFlow.",
          ],
        },
        {
          title: "8. Conservación de datos",
          body: "Tras la cancelación, KineFlow podrá conservar la información durante un plazo máximo de noventa (90) días para permitir reactivaciones, resolver reclamos o cumplir obligaciones legales.",
        },
        {
          title: "9. Contacto",
          body: "contacto@kineflow.ar",
        },
      ]}
      title="Suscripciones, Cancelaciones y Reembolsos"
      updatedAt={updatedAt}
    />
  );
}
