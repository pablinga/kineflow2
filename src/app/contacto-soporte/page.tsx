import { LegalPage } from "@/components/layout/LegalPage";

export default function SupportPage() {
  return (
    <LegalPage
      intro="Canales iniciales de contacto para consultas comerciales, legales y de soporte."
      sections={[
        {
          title: "Email",
          body: "Para soporte, baja de servicio, consultas legales o problemas de pago, escribi a contacto@kineflow.app.",
        },
        {
          title: "Informacion util",
          body: "Inclui el email de tu cuenta, una descripcion clara del problema y, si corresponde, la referencia de gestion de baja.",
        },
      ]}
      title="Contacto de Soporte"
    />
  );
}
