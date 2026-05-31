import { LegalPage } from "@/components/layout/LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage
      intro="Contenido inicial sujeto a revision legal sobre tratamiento de datos personales."
      sections={[
        {
          title: "Datos personales",
          body: "KineFlow trata datos del usuario profesional y datos administrativos que el profesional carga sobre sus pacientes para brindar el servicio contratado.",
        },
        {
          title: "Responsable de la informacion",
          body: "El usuario profesional es responsable de contar con base legal y autorizaciones necesarias para cargar y gestionar informacion de sus pacientes.",
        },
        {
          title: "Pagos",
          body: "KineFlow utiliza Mercado Pago como procesador de pagos. La informacion de pago se gestiona bajo las condiciones y politicas de Mercado Pago.",
        },
      ]}
      title="Politica de Privacidad"
    />
  );
}
