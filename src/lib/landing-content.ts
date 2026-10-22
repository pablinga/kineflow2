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
