import { LegalPage } from "@/components/layout/LegalPage";

export default function TermsPage() {
  return (
    <LegalPage
      intro="Contenido inicial sujeto a revision legal. Al registrarse y contratar un plan, el usuario acepta estas condiciones."
      sections={[
        {
          title: "Objeto",
          body: "KineFlow es una plataforma administrativa para kinesiologos independientes. Permite organizar pacientes, turnos, sesiones, evolucion y cobros.",
        },
        {
          title: "Alcance profesional",
          body: "KineFlow no reemplaza el criterio profesional ni constituye asesoramiento medico. El usuario profesional es responsable por la informacion que carga y por las decisiones vinculadas a sus pacientes.",
        },
        {
          title: "Responsabilidad",
          body: "El servicio se presta como herramienta de gestion. KineFlow no garantiza resultados clinicos y limita su responsabilidad a un uso razonable de la plataforma conforme la normativa aplicable.",
        },
      ]}
      title="Terminos y Condiciones"
    />
  );
}
