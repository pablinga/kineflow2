import { LegalPage } from "@/components/layout/LegalPage";

export default function RegretPage() {
  return (
    <LegalPage
      intro="Informacion inicial sobre el procedimiento de arrepentimiento cuando corresponda."
      sections={[
        {
          title: "Solicitud",
          body: "Si la normativa aplicable reconoce un derecho de arrepentimiento, el usuario podra solicitarlo por los canales de soporte de KineFlow.",
        },
        {
          title: "Revision",
          body: "KineFlow revisara la solicitud, el estado de la suscripcion y los pagos procesados mediante Mercado Pago.",
        },
      ]}
      title="Arrepentimiento"
    />
  );
}
