import { LegalPage } from "@/components/layout/LegalPage";

export default function RegretPage() {
  return (
    <LegalPage
      intro="Información inicial sobre el procedimiento de arrepentimiento cuando corresponda."
      sections={[
        {
          title: "Solicitud",
          body: "Si la normativa aplicable reconoce un derecho de arrepentimiento, el usuario podra solicitarlo por los canales de soporte de KineFlow.",
        },
        {
          title: "Revision",
          body: "KineFlow revisará la solicitud, el estado de la suscripción y los pagos procesados mediante Mercado Pago.",
        },
      ]}
      title="Arrepentimiento"
    />
  );
}
