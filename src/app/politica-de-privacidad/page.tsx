import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";

export const metadata: Metadata = {
  alternates: { canonical: "/politica-de-privacidad" },
  description: "Cómo KineFlow trata y protege los datos de profesionales y pacientes.",
  title: "Política de privacidad",
};

const updatedAt = "31 de octubre de 2026";

export default function PrivacyPage() {
  return (
    <LegalPage
      intro="Esta Política de Privacidad explica qué datos trata KineFlow, para qué, con quién los comparte, cómo los protege y cómo ejercer tus derechos, de acuerdo con la Ley 25.326 de Protección de los Datos Personales de la República Argentina. Aplica al sitio kineflow.ar y a la app de KineFlow para Android."
      sections={[
        {
          title: "1. Responsable",
          body: [
            "KineFlow es una plataforma operada por Pablo Schiaffino (CUIL 20-34519263-9). Contacto: contacto@kineflow.ar.",
            "Respecto de los datos de los profesionales y clínicas que usan la plataforma, KineFlow es el responsable de la base de datos.",
            "Respecto de los datos de los pacientes que cada profesional o clínica carga en su cuenta, el responsable es ese profesional o clínica. KineFlow los trata solo por cuenta y orden de ellos, para prestar el servicio, y no los usa para fines propios.",
          ],
        },
        {
          title: "2. Datos que tratamos",
          body: [
            "Datos de la cuenta: nombre y apellido, correo electrónico, teléfono, datos profesionales (por ejemplo, matrícula y localidad del perfil público), datos de la clínica y datos de facturación y del plan.",
            "Datos de pacientes que carga el profesional: nombre y apellido, documento, teléfono, correo, cobertura (obra social o ART y número de afiliado), turnos, asistencia y cobros.",
            "Datos de salud de pacientes que carga el profesional: evaluaciones, zonas del cuerpo tratadas, evoluciones, tratamientos, órdenes médicas y archivos adjuntos (por ejemplo, estudios u órdenes).",
            "Datos de quien reserva un turno en la página pública de reservas: nombre, apellido, documento, teléfono, correo, cobertura y número de afiliado (si corresponde) y su consentimiento para recibir recordatorios por WhatsApp.",
            "Datos técnicos: registros de acceso, dispositivo y navegador, y estadísticas de uso anónimas. Si activás las notificaciones, guardamos la suscripción de tu dispositivo para enviarlas.",
          ],
        },
        {
          title: "3. Datos de salud",
          body: [
            "Los datos de salud son datos sensibles (artículos 2, 7 y 8 de la Ley 25.326). Solo los cargan y los ven el profesional o la clínica que atiende al paciente y las personas de su equipo a las que les dan acceso.",
            "El profesional o la clínica declara contar con el consentimiento de sus pacientes, o con otra base legal, para tratar esos datos, y es responsable de cumplir sus obligaciones como profesional de la salud, incluida la conservación de la historia clínica (Ley 26.529).",
            "KineFlow no usa los datos de salud de los pacientes para publicidad, no los vende ni los cede, y no los usa para entrenar modelos de inteligencia artificial.",
          ],
        },
        {
          title: "4. Para qué los usamos",
          body: [
            "Prestar el servicio: agenda, reservas online, fichas de pacientes, cobros, reportes y recordatorios.",
            "Gestionar cuentas, planes y suscripciones.",
            "Enviar avisos del servicio por correo, WhatsApp o notificaciones (por ejemplo, confirmaciones y recordatorios de turnos).",
            "Brindar soporte, mejorar la plataforma con estadísticas agregadas, prevenir fraudes y abusos, y cumplir obligaciones legales.",
          ],
        },
        {
          title: "5. Proveedores que procesan datos",
          body: [
            "Para prestar el servicio usamos proveedores que procesan datos por cuenta de KineFlow y solo para eso:",
            "Supabase: base de datos, autenticación y archivos.",
            "Vercel: alojamiento del sitio y estadísticas de uso anónimas (Vercel Analytics y Speed Insights).",
            "Resend: envío de correos.",
            "Meta (WhatsApp Business): envío de confirmaciones y recordatorios de turnos a pacientes que lo aceptaron.",
            "Cloudflare Turnstile: protección contra bots en la página de reservas.",
            "Mercado Pago: cobro de suscripciones. KineFlow no recibe ni guarda los datos de tus tarjetas.",
          ],
        },
        {
          title: "6. Dónde se guardan los datos",
          body: "Los servidores de Supabase y Vercel que usamos están en los Estados Unidos. Al usar KineFlow, los datos se transfieren y almacenan allí, con proveedores que aplican medidas de seguridad y confidencialidad acordes con la Ley 25.326.",
        },
        {
          title: "7. Seguridad",
          body: [
            "Toda la comunicación viaja cifrada (HTTPS).",
            "Cada cuenta accede solo a sus propios datos: los permisos se controlan en la base de datos, por espacio de trabajo y por rol (administración, recepción o profesional del equipo).",
            "Los archivos se guardan en almacenamiento privado y se abren con enlaces temporales.",
            "Las páginas con datos de pacientes no se guardan en el dispositivo para uso sin conexión.",
            "Ningún sistema es infalible: si detectamos un incidente que afecte tus datos, te lo vamos a informar.",
          ],
        },
        {
          title: "8. Conservación",
          body: [
            "Conservamos los datos mientras la cuenta esté activa.",
            "Si pedís eliminar la cuenta, borramos sus datos, salvo los que debamos conservar por obligación legal o para resolver reclamos (por ejemplo, registros de pagos), durante el plazo que corresponda.",
            "Antes de eliminar una cuenta, el profesional debe resguardar la información que esté obligado a conservar.",
          ],
        },
        {
          title: "9. Tus derechos",
          body: [
            "Podés pedir acceso, rectificación, actualización y supresión de tus datos escribiendo a contacto@kineflow.ar. Respondemos dentro de los plazos de la Ley 25.326 (10 días corridos para el acceso y 5 días hábiles para rectificar o suprimir).",
            "Para eliminar tu cuenta seguí los pasos de https://www.kineflow.ar/eliminar-cuenta.",
            "Si sos paciente de un profesional que usa KineFlow, dirigí tu pedido a ese profesional o clínica, que es el responsable de tus datos. Si nos escribís a nosotros, se lo vamos a derivar y lo vamos a ayudar a responder.",
            "El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326.",
            "La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.",
          ],
        },
        {
          title: "10. Cookies y almacenamiento en el dispositivo",
          body: "Usamos cookies y almacenamiento local del navegador solo para el funcionamiento del servicio: mantener la sesión, recordar preferencias (por ejemplo, la vista de la agenda) y saber desde qué campaña llegaste al sitio. Las estadísticas de uso no usan cookies. No usamos cookies de publicidad.",
        },
        {
          title: "11. Menores de edad",
          body: "Las cuentas de KineFlow son para profesionales y clínicas mayores de 18 años. Los datos de pacientes menores los carga el profesional, que debe contar con la autorización de sus padres o representantes.",
        },
        {
          title: "12. Cambios en esta política",
          body: "Si cambiamos esta política, actualizamos la fecha de arriba y, si el cambio es importante, te avisamos por correo o dentro de la plataforma.",
        },
        {
          title: "13. Contacto",
          body: "contacto@kineflow.ar",
        },
      ]}
      title="Política de Privacidad"
      updatedAt={updatedAt}
    />
  );
}
