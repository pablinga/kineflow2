import type {
  Appointment,
  PaymentStatus,
  PaymentType,
} from "@/hooks/useAppointments";
import type { Patient } from "@/hooks/usePatients";

/**
 * Datos ficticios de la demo pública (/demo). Son estáticos: cada turno se
 * define por día de la semana y hora, y las fechas se calculan sobre la
 * semana actual para que la demo siempre se vea al día. Nombres, DNI y
 * teléfonos son inventados (teléfonos con prefijo 555, que no se asigna).
 * Nada de esto sale de la base ni se guarda.
 */

type DemoPatientDefinition = {
  condition: string;
  document: string;
  email: string;
  id: string;
  name: string;
  phone: string;
  status: Patient["status"];
};

export const DEMO_PATIENTS: DemoPatientDefinition[] = [
  { condition: "Lumbalgia mecánica", document: "30111222", email: "", id: "demo-p1", name: "Lucía Fernández", phone: "11 5555-0101", status: "Activo" },
  { condition: "Post operatorio LCA rodilla derecha", document: "28333444", email: "martin.demo@ejemplo.com", id: "demo-p2", name: "Martín Gómez", phone: "11 5555-0102", status: "Activo" },
  { condition: "Tendinopatía del manguito rotador", document: "35555666", email: "", id: "demo-p3", name: "Sofía Benítez", phone: "11 5555-0103", status: "Activo" },
  { condition: "Esguince de tobillo grado II", document: "40777888", email: "", id: "demo-p4", name: "Tomás Aguirre", phone: "11 5555-0104", status: "Activo" },
  { condition: "Cervicalgia", document: "25999000", email: "carmen.demo@ejemplo.com", id: "demo-p5", name: "Carmen Ríos", phone: "11 5555-0105", status: "Activo" },
  { condition: "Rehabilitación de fractura de muñeca", document: "33222111", email: "", id: "demo-p6", name: "Julián Paz", phone: "11 5555-0106", status: "Activo" },
  { condition: "Fascitis plantar", document: "31444333", email: "", id: "demo-p7", name: "Valentina Sosa", phone: "11 5555-0107", status: "Activo" },
  { condition: "Alta: epicondilitis", document: "27666555", email: "", id: "demo-p8", name: "Ricardo Molina", phone: "", status: "Inactivo" },
];

type DemoAppointmentDefinition = {
  amount: number;
  attentionTypeName: string;
  /** 0 = lunes … 5 = sábado de la semana actual. */
  day: number;
  durationMinutes: number;
  /** Cómo quedó si el horario ya pasó (si es futuro queda pendiente). */
  outcome: "attended" | "no_show" | "pending";
  patientId: string;
  paymentStatus: PaymentStatus;
  paymentType: PaymentType;
  time: string;
};

const SESSION = "Sesión de kinesiología";
const EVALUATION = "Evaluación inicial";

const DEMO_APPOINTMENTS: DemoAppointmentDefinition[] = [
  { amount: 18000, attentionTypeName: SESSION, day: 0, durationMinutes: 45, outcome: "attended", patientId: "demo-p1", paymentStatus: "paid", paymentType: "PARTICULAR", time: "09:00" },
  { amount: 0, attentionTypeName: SESSION, day: 0, durationMinutes: 45, outcome: "attended", patientId: "demo-p2", paymentStatus: "not_applicable", paymentType: "OBRA_SOCIAL", time: "10:00" },
  { amount: 18000, attentionTypeName: SESSION, day: 0, durationMinutes: 45, outcome: "no_show", patientId: "demo-p4", paymentStatus: "pending", paymentType: "PARTICULAR", time: "17:30" },
  { amount: 22000, attentionTypeName: EVALUATION, day: 1, durationMinutes: 60, outcome: "attended", patientId: "demo-p6", paymentStatus: "paid", paymentType: "PARTICULAR", time: "08:30" },
  { amount: 18000, attentionTypeName: SESSION, day: 1, durationMinutes: 45, outcome: "attended", patientId: "demo-p3", paymentStatus: "pending", paymentType: "PARTICULAR", time: "11:00" },
  { amount: 0, attentionTypeName: SESSION, day: 1, durationMinutes: 45, outcome: "attended", patientId: "demo-p5", paymentStatus: "not_applicable", paymentType: "OBRA_SOCIAL", time: "18:00" },
  { amount: 18000, attentionTypeName: SESSION, day: 2, durationMinutes: 45, outcome: "attended", patientId: "demo-p1", paymentStatus: "paid", paymentType: "PARTICULAR", time: "09:00" },
  { amount: 0, attentionTypeName: SESSION, day: 2, durationMinutes: 45, outcome: "pending", patientId: "demo-p2", paymentStatus: "not_applicable", paymentType: "OBRA_SOCIAL", time: "10:00" },
  { amount: 18000, attentionTypeName: SESSION, day: 2, durationMinutes: 45, outcome: "attended", patientId: "demo-p7", paymentStatus: "pending", paymentType: "PARTICULAR", time: "15:30" },
  { amount: 0, attentionTypeName: SESSION, day: 2, durationMinutes: 45, outcome: "pending", patientId: "demo-p4", paymentStatus: "not_applicable", paymentType: "ART", time: "19:00" },
  { amount: 18000, attentionTypeName: SESSION, day: 3, durationMinutes: 45, outcome: "attended", patientId: "demo-p3", paymentStatus: "paid", paymentType: "PARTICULAR", time: "11:00" },
  { amount: 22000, attentionTypeName: EVALUATION, day: 3, durationMinutes: 60, outcome: "attended", patientId: "demo-p7", paymentStatus: "paid", paymentType: "PARTICULAR", time: "16:00" },
  { amount: 0, attentionTypeName: SESSION, day: 3, durationMinutes: 45, outcome: "pending", patientId: "demo-p5", paymentStatus: "not_applicable", paymentType: "OBRA_SOCIAL", time: "18:00" },
  { amount: 18000, attentionTypeName: SESSION, day: 4, durationMinutes: 45, outcome: "attended", patientId: "demo-p1", paymentStatus: "pending", paymentType: "PARTICULAR", time: "09:00" },
  { amount: 0, attentionTypeName: SESSION, day: 4, durationMinutes: 45, outcome: "attended", patientId: "demo-p2", paymentStatus: "not_applicable", paymentType: "OBRA_SOCIAL", time: "10:00" },
  { amount: 18000, attentionTypeName: SESSION, day: 4, durationMinutes: 45, outcome: "pending", patientId: "demo-p6", paymentStatus: "pending", paymentType: "PARTICULAR", time: "12:30" },
  { amount: 18000, attentionTypeName: SESSION, day: 5, durationMinutes: 45, outcome: "pending", patientId: "demo-p3", paymentStatus: "pending", paymentType: "PARTICULAR", time: "10:00" },
];

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_applicable: "No corresponde",
  paid: "Cobrado",
  pending: "Pendiente",
  waived: "Bonificado",
};

export function startOfDemoWeek(now: Date) {
  const start = new Date(now);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatDay(date: Date) {
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(date: Date) {
  return `${formatDay(date)} ${date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  })}`;
}

/** Turnos ficticios de la semana de `now`, ordenados por fecha. */
export function buildDemoAppointments(now: Date): Appointment[] {
  const weekStart = startOfDemoWeek(now);
  const patients = new Map(DEMO_PATIENTS.map((patient) => [patient.id, patient]));

  return DEMO_APPOINTMENTS.map((definition, index): Appointment => {
    const [hours, minutes] = definition.time.split(":").map(Number);
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + definition.day);
    date.setHours(hours, minutes, 0, 0);
    const isPast = date.getTime() < now.getTime();
    const rawStatus = isPast ? definition.outcome : "pending";
    // Un turno que todavía no se atendió no puede estar cobrado.
    const paymentStatus: PaymentStatus =
      rawStatus === "attended" || definition.paymentStatus !== "paid"
        ? definition.paymentStatus
        : "pending";

    return {
      allowsSimultaneous: false,
      amount: definition.amount,
      artProviderId: null,
      attentionTypeId: null,
      attentionTypeName: definition.attentionTypeName,
      clinicId: null,
      clinicName: null,
      clinicProfessionalId: null,
      conflictWarning: null,
      depositAmount: null,
      depositStatus: null,
      date: formatDay(date),
      duration: `${definition.durationMinutes} min`,
      durationMinutes: definition.durationMinutes,
      id: `demo-a${index + 1}`,
      insuranceMemberNumber: null,
      insuranceProviderId: null,
      modality: "Presencial",
      origin: "independent",
      originColor: "#0b97dc",
      originLabel: "Propio",
      ownerId: "demo",
      paidAt: null,
      patient: patients.get(definition.patientId)?.name ?? "Paciente",
      patientId: definition.patientId,
      paymentMethod: paymentStatus === "paid" ? "transfer" : "",
      paymentMethodLabel: paymentStatus === "paid" ? "Transferencia" : "Sin medio",
      paymentNotes: "",
      paymentStatus,
      paymentStatusLabel: PAYMENT_STATUS_LABELS[paymentStatus],
      paymentType: definition.paymentType,
      professionalName: null,
      rawStatus,
      reason: definition.attentionTypeName,
      scheduledAt: date.toISOString(),
      sessionNumber: null,
      signaturePath: null,
      signedAt: null,
      status:
        rawStatus === "attended" ? "Asistió" : rawStatus === "no_show" ? "No asistió" : "Pendiente",
      time: definition.time,
      treatmentId: null,
      workspaceId: "demo",
    };
  }).sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
}

/** Pacientes ficticios con última sesión y próximo turno según la demo. */
export function buildDemoPatients(appointments: Appointment[], now: Date) {
  return DEMO_PATIENTS.map((patient) => {
    const own = appointments.filter((appointment) => appointment.patientId === patient.id);
    const last = own.filter(
      (appointment) =>
        appointment.rawStatus === "attended" &&
        new Date(appointment.scheduledAt).getTime() < now.getTime(),
    ).at(-1);
    const next = own.find(
      (appointment) => new Date(appointment.scheduledAt).getTime() >= now.getTime(),
    );

    return {
      ...patient,
      lastSession: last ? last.date : "Sin sesiones",
      nextAppointment: next ? formatDateTime(new Date(next.scheduledAt)) : "Sin turno",
    };
  });
}
