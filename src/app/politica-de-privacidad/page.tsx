import { LegalPage } from "@/components/layout/LegalPage";

const updatedAt = "11 de junio de 2026";

export default function PrivacyPage() {
  return (
    <LegalPage
      intro="La presente Política de Privacidad describe cómo KineFlow recopila, utiliza, almacena y protege la información de sus usuarios."
      sections={[
        {
          title: "1. Introducción",
          body: "La presente Política de Privacidad describe cómo KineFlow recopila, utiliza, almacena y protege la información de sus usuarios.",
        },
        {
          title: "2. Datos recopilados",
          body: [
            "Datos del profesional: nombre y apellido, correo electrónico, teléfono, datos de facturación e información de la cuenta.",
            "Datos de pacientes cargados por el profesional: nombre y apellido, información de contacto, turnos, sesiones, evoluciones e información administrativa relacionada con la atención.",
          ],
        },
        {
          title: "3. Finalidades",
          body: [
            "Los datos podrán utilizarse para prestar el servicio contratado.",
            "Gestionar cuentas y suscripciones.",
            "Brindar soporte técnico.",
            "Mejorar la plataforma.",
            "Cumplir obligaciones legales.",
            "Detectar actividades fraudulentas.",
          ],
        },
        {
          title: "4. Datos de pacientes",
          body: [
            "El profesional usuario declara contar con las autorizaciones necesarias para tratar los datos de sus pacientes.",
            "KineFlow actúa exclusivamente como proveedor tecnológico.",
          ],
        },
        {
          title: "5. Proveedores utilizados",
          body: [
            "KineFlow utiliza servicios de terceros para la prestación del servicio, incluyendo:",
            "Supabase",
            "Vercel",
            "Mercado Pago",
          ],
        },
        {
          title: "6. Conservación de datos",
          body: "Los datos se conservarán mientras exista una cuenta activa y durante el tiempo necesario para cumplir obligaciones legales o resolver reclamos.",
        },
        {
          title: "7. Derechos de los usuarios",
          body: [
            "Los usuarios podrán solicitar acceso, rectificación, actualización y eliminación.",
            "Las solicitudes podrán enviarse a contacto@kineflow.ar.",
          ],
        },
        {
          title: "8. Seguridad",
          body: "KineFlow adopta medidas razonables para proteger la información almacenada.",
        },
        {
          title: "9. Cookies",
          body: "KineFlow podrá utilizar cookies técnicas necesarias para el funcionamiento del servicio.",
        },
        {
          title: "10. Modificaciones",
          body: "KineFlow podrá actualizar esta política periódicamente.",
        },
        {
          title: "11. Contacto",
          body: "contacto@kineflow.ar",
        },
      ]}
      title="Política de Privacidad"
      updatedAt={updatedAt}
    />
  );
}
