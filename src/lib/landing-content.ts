import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  HeartPulse,
  MessageCircle,
  UsersRound,
} from "lucide-react";
import { formatMonto } from "@/lib/format";
import { CONSULTORIO_PRICE, INDEPENDENT_PLAN_PRICE } from "@/lib/plans";

// Textos de la landing que también usa /llms.txt (una sola fuente).

export const LANDING_FEATURES = [
  {
    icon: CalendarClock,
    title: "Reservas online",
    text: "Tus pacientes reservan turnos solos desde un link, sin que vos tengas que coordinar por mensajes.",
  },
  {
    icon: CalendarDays,
    title: "Agenda simple",
    text: "Turnos claros para organizar el día desde el celular.",
  },
  {
    icon: UsersRound,
    title: "Pacientes ordenados",
    text: "Datos, historial y tratamientos en una ficha fácil de leer.",
  },
  {
    icon: HeartPulse,
    title: "Evolución por tratamiento",
    text: "Notas y seguimiento del progreso en cada sesión.",
  },
  {
    icon: ClipboardList,
    title: "Registro de sesiones",
    text: "Asistencia, observaciones y continuidad sin planillas sueltas.",
  },
  {
    icon: CreditCard,
    title: "Control de cobros",
    text: "Cobros por sesión y pendientes siempre visibles.",
  },
];

export const LANDING_WHATSAPP_BENEFITS = [
  {
    icon: CheckCircle2,
    title: "Menos ausencias",
    text: "Tus pacientes no se olvidan del turno.",
  },
  {
    icon: Clock,
    title: "Ahorrá tiempo",
    text: "La confirmación y el recordatorio se envían solos a quienes los aceptan.",
  },
  {
    icon: MessageCircle,
    title: "Sin coordinar a mano",
    text: "Nada de escribir uno por uno para confirmar.",
  },
];

export const LANDING_INSTAGRAM_URL = "https://www.instagram.com/kineflow.ar/";
export const LANDING_CONTACT_EMAIL = "contacto@kineflow.ar";

/** "$ 20.000" sin que el renglón se corte entre el signo y el número. */
function priceText(amount: number) {
  return formatMonto(amount).replace(/\s/g, "\u00a0");
}

// Preguntas frecuentes: sección de la landing, FAQPage (JSON-LD) y /llms.txt.
// Solo afirmaciones que el producto cumple hoy.
export const LANDING_FAQ = [
  {
    answer:
      "Es un software de gestión para kinesiólogos y clínicas de rehabilitación de Argentina: agenda, reservas online, ficha de cada paciente con evoluciones y tratamientos, cobros y recordatorios de turnos por WhatsApp, todo en un solo lugar.",
    question: "¿Qué es KineFlow?",
  },
  {
    answer: `No. La prueba gratuita dura 3 meses, sin tarjeta y sin compromiso. Después podés seguir con KineFlow - Particular (${priceText(INDEPENDENT_PLAN_PRICE)} por mes) o con el Plan Consultorio (${priceText(CONSULTORIO_PRICE)} por mes).`,
    question: "¿Necesito tarjeta para probarlo?",
  },
  {
    answer:
      "Sí. Con el Plan Consultorio sumás profesionales sin límite, cada uno con su agenda y sus horarios, cuentas de recepción para dar turnos y reportes de sesiones e ingresos por profesional.",
    question: "¿Sirve para clínicas con varios profesionales?",
  },
  {
    answer:
      "Compartís tu link de reservas o el código QR. El paciente ve tus horarios libres, elige uno y carga sus datos; el turno aparece en tu agenda sin que tengas que coordinar por mensajes.",
    question: "¿Cómo reservan turnos mis pacientes?",
  },
  {
    answer:
      "Sí, a los pacientes que aceptan recibirlos: KineFlow les envía la confirmación del turno y un recordatorio 24 horas antes, sin que tengas que escribirles.",
    question: "¿Envía recordatorios por WhatsApp?",
  },
  {
    answer:
      "Sí. Funciona desde el navegador del celular, la tablet o la computadora, y en Android y iPhone se puede instalar como una app.",
    question: "¿Funciona en el celular?",
  },
  {
    answer:
      "Solo vos o, en una clínica, el equipo según los permisos de cada uno. Tu página pública muestra tu perfil y tus horarios libres, nunca datos de pacientes.",
    question: "¿Quién ve los datos de mis pacientes?",
  },
  {
    answer:
      "Sí. Podés importar tus pacientes desde un Excel o CSV y empezar a usar la agenda el mismo día.",
    question: "¿Puedo traer mis pacientes desde Excel?",
  },
  {
    answer:
      "Sí. En cada turno registrás la obra social o ART y el número de afiliado, y desde Reportes descargás en Excel las sesiones para rendir.",
    question: "¿Sirve si trabajo con obras sociales?",
  },
  {
    answer:
      "Desde Plan en tu cuenta o escribiendo a contacto@kineflow.ar. La cancelación evita las próximas renovaciones y el acceso sigue hasta que termina el período ya pagado.",
    question: "¿Cómo cancelo la suscripción?",
  },
];

export type LandingTestimonial = { quote: string; name: string; role: string; city?: string };

// Solo testimonios reales, con permiso de la persona para publicar su nombre.
export const LANDING_TESTIMONIALS: LandingTestimonial[] = [
  {
    name: "Melisa",
    role: "Kinesióloga, clínica de rehabilitación",
    quote:
      "Doy los turnos de todo el equipo desde un mismo calendario y veo de un vistazo qué días tienen lugar. Además, a los pacientes les llega el recordatorio por WhatsApp sin que yo haga nada.",
  },
  {
    name: "Estanislao",
    role: "Kinesiólogo",
    quote:
      "Tengo la evolución de cada paciente a mano y la cargo desde el celular entre sesión y sesión. Es lo que más uso.",
  },
];
