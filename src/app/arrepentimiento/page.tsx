import { LegalPage } from "@/components/layout/LegalPage";

const updatedAt = "11 de junio de 2026";

export default function RegretPage() {
  return (
    <LegalPage
      intro="Los usuarios podrán ejercer el derecho de arrepentimiento respecto de contrataciones realizadas a distancia conforme a la normativa aplicable."
      sections={[
        {
          title: "Derecho de arrepentimiento",
          body: "Los usuarios podrán ejercer el derecho de arrepentimiento respecto de contrataciones realizadas a distancia conforme a la normativa aplicable.",
        },
        {
          title: "Cómo solicitarlo",
          body: [
            "La solicitud deberá enviarse a:",
            "contacto@kineflow.ar",
            "Indicando nombre y apellido, correo electrónico de la cuenta, fecha de contratación y comentario opcional.",
          ],
        },
        {
          title: "Revisión",
          body: [
            "KineFlow analizará:",
            "Estado de la suscripción.",
            "Pagos realizados.",
            "Utilización efectiva del servicio.",
          ],
        },
        {
          title: "Respuesta",
          body: "KineFlow responderá dentro de un plazo razonable e informará una referencia o número de gestión cuando corresponda.",
        },
        {
          title: "Formulario",
          body: [
            "Nombre y apellido",
            "Correo electrónico",
            "Fecha de contratación",
            "Comentario (opcional)",
          ],
        },
      ]}
      title="Derecho de Arrepentimiento"
      updatedAt={updatedAt}
    />
  );
}
