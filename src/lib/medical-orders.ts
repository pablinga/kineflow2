/**
 * Órdenes médicas: a qué orden corresponde cada turno de obra social / ART,
 * qué número de sesión es y qué órdenes hay que renovar. Lógica pura (sin
 * red): las sesiones usadas no se guardan en la base, se calculan con los
 * turnos cada vez.
 *
 * Reglas (decididas con el usuario):
 * - Solo descuenta "Asistió". "No asistió" y cancelados no consumen la orden.
 * - Los turnos pendientes se proyectan sobre la orden, así la agenda muestra
 *   "Sesión 9 de 10" antes de atender y se avisa si no alcanza.
 * - Pasarse de la orden no bloquea nada: el turno queda "Fuera de orden".
 * - Un turno usa la orden más vieja de su prestador vigente en esa fecha que
 *   tenga lugar.
 */

export type MedicalOrderCoverage = "OBRA_SOCIAL" | "ART";

export type MedicalOrderInput = {
  authorizedSessions: number;
  coverageType: MedicalOrderCoverage;
  /** YYYY-MM-DD, o null si la orden no vence. */
  expiresOn: string | null;
  id: string;
  /** YYYY-MM-DD. */
  issuedOn: string;
  patientId: string;
  /** Obra social o ART según `coverageType`; null si se borró el prestador. */
  providerId: string | null;
};

export type OrderAppointmentInput = {
  /** YYYY-MM-DD en hora de Argentina. */
  date: string;
  id: string;
  patientId: string;
  paymentType: string;
  providerId: string | null;
  /** Para ordenar turnos del mismo día. */
  scheduledAt: string;
  status: string;
};

export type AppointmentOrderInfo =
  | {
      authorizedSessions: number;
      kind: "covered";
      orderId: string;
      /** El turno ya descontó la sesión (asistió). */
      consumed: boolean;
      sessionNumber: number;
    }
  | { kind: "exceeded"; orderId: string }
  | { kind: "no_order" };

export type MedicalOrderState = "active" | "low" | "expiring" | "complete" | "expired";

export type MedicalOrderUsage = {
  orderId: string;
  /** Turnos pendientes que ya tienen lugar en esta orden. */
  scheduled: number;
  /** Turnos pendientes del paciente con este prestador que no entran en ninguna orden. */
  uncoveredScheduled: number;
  remaining: number;
  state: MedicalOrderState;
  used: number;
};

const CONSUMED_STATUSES = new Set(["attended", "completed"]);
const PROJECTED_STATUSES = new Set(["pending", "confirmed", "rescheduled", "awaiting_payment"]);

/** Quedan pocas sesiones: aviso desde este número. */
export const LOW_SESSIONS_THRESHOLD = 2;
/** Vence pronto: aviso desde estos días antes. */
export const EXPIRING_DAYS_THRESHOLD = 7;

export function isOrderCoverage(paymentType: string): paymentType is MedicalOrderCoverage {
  return paymentType === "OBRA_SOCIAL" || paymentType === "ART";
}

/** El turno cuenta para órdenes (cobertura y estado que consume o proyecta). */
export function isOrderRelevantAppointment(appointment: OrderAppointmentInput) {
  return (
    isOrderCoverage(appointment.paymentType) &&
    (CONSUMED_STATUSES.has(appointment.status) || PROJECTED_STATUSES.has(appointment.status))
  );
}

function matchesOrder(order: MedicalOrderInput, appointment: OrderAppointmentInput) {
  return (
    order.patientId === appointment.patientId &&
    order.coverageType === appointment.paymentType &&
    order.providerId !== null &&
    order.providerId === appointment.providerId
  );
}

function isValidOn(order: MedicalOrderInput, date: string) {
  return order.issuedOn <= date && (!order.expiresOn || date <= order.expiresOn);
}

function daysBetween(from: string, to: string) {
  const start = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / 86_400_000);
}

export function getOrderState(
  order: Pick<MedicalOrderInput, "authorizedSessions" | "expiresOn">,
  used: number,
  today: string,
): MedicalOrderState {
  if (used >= order.authorizedSessions) {
    return "complete";
  }

  if (order.expiresOn && order.expiresOn < today) {
    return "expired";
  }

  if (order.authorizedSessions - used <= LOW_SESSIONS_THRESHOLD) {
    return "low";
  }

  if (order.expiresOn && daysBetween(today, order.expiresOn) <= EXPIRING_DAYS_THRESHOLD) {
    return "expiring";
  }

  return "active";
}

/** Reparte los turnos entre las órdenes, en orden cronológico. */
export function allocateMedicalOrders(
  orders: readonly MedicalOrderInput[],
  appointments: readonly OrderAppointmentInput[],
  today: string,
) {
  const sortedOrders = [...orders].sort((a, b) =>
    a.issuedOn === b.issuedOn ? a.id.localeCompare(b.id) : a.issuedOn.localeCompare(b.issuedOn),
  );
  const sortedAppointments = appointments
    .filter(isOrderRelevantAppointment)
    .sort((a, b) =>
      a.scheduledAt === b.scheduledAt
        ? a.id.localeCompare(b.id)
        : a.scheduledAt.localeCompare(b.scheduledAt),
    );

  const taken = new Map(sortedOrders.map((order) => [order.id, 0]));
  const used = new Map(sortedOrders.map((order) => [order.id, 0]));
  const scheduled = new Map(sortedOrders.map((order) => [order.id, 0]));
  const byAppointment = new Map<string, AppointmentOrderInfo>();
  const uncovered: OrderAppointmentInput[] = [];

  for (const appointment of sortedAppointments) {
    const consumed = CONSUMED_STATUSES.has(appointment.status);
    const candidates = sortedOrders.filter(
      (order) => matchesOrder(order, appointment) && isValidOn(order, appointment.date),
    );
    const order = candidates.find(
      (candidate) => (taken.get(candidate.id) ?? 0) < candidate.authorizedSessions,
    );

    if (order) {
      const sessionNumber = (taken.get(order.id) ?? 0) + 1;
      taken.set(order.id, sessionNumber);
      (consumed ? used : scheduled).set(
        order.id,
        ((consumed ? used : scheduled).get(order.id) ?? 0) + 1,
      );
      byAppointment.set(appointment.id, {
        authorizedSessions: order.authorizedSessions,
        consumed,
        kind: "covered",
        orderId: order.id,
        sessionNumber,
      });
      continue;
    }

    const full = candidates.at(-1);
    byAppointment.set(
      appointment.id,
      full ? { kind: "exceeded", orderId: full.id } : { kind: "no_order" },
    );

    if (!consumed) {
      uncovered.push(appointment);
    }
  }

  const usage = new Map<string, MedicalOrderUsage>();

  for (const order of sortedOrders) {
    const orderUsed = used.get(order.id) ?? 0;
    const uncoveredScheduled = uncovered.filter(
      (appointment) => matchesOrder(order, appointment) && appointment.date >= today,
    ).length;

    usage.set(order.id, {
      orderId: order.id,
      remaining: Math.max(order.authorizedSessions - orderUsed, 0),
      scheduled: scheduled.get(order.id) ?? 0,
      state: getOrderState(order, orderUsed, today),
      uncoveredScheduled,
      used: orderUsed,
    });
  }

  return { byAppointment, usage };
}

export type MedicalOrderAlert =
  | {
      kind: "renew";
      orderId: string;
      patientId: string;
      remaining: number;
      state: "low" | "expiring";
      expiresOn: string | null;
      uncoveredScheduled: number;
    }
  | { kind: "no_order"; patientId: string; appointmentId: string; date: string; scheduledAt: string };

/**
 * Avisos para el Inicio: órdenes con pocas sesiones o por vencer, y el
 * próximo turno de cada paciente que no tiene orden (dentro de `horizonDays`).
 * Una orden ya reemplazada por una más nueva del mismo prestador no avisa.
 */
export function buildMedicalOrderAlerts(
  orders: readonly MedicalOrderInput[],
  appointments: readonly OrderAppointmentInput[],
  today: string,
  horizonDays = 14,
): MedicalOrderAlert[] {
  const { byAppointment, usage } = allocateMedicalOrders(orders, appointments, today);
  const alerts: MedicalOrderAlert[] = [];

  for (const order of orders) {
    const orderUsage = usage.get(order.id);

    if (!orderUsage || (orderUsage.state !== "low" && orderUsage.state !== "expiring")) {
      continue;
    }

    const replaced = orders.some(
      (other) =>
        other.id !== order.id &&
        other.patientId === order.patientId &&
        other.coverageType === order.coverageType &&
        other.providerId === order.providerId &&
        other.issuedOn > order.issuedOn &&
        (usage.get(other.id)?.state ?? "complete") !== "complete" &&
        (usage.get(other.id)?.state ?? "expired") !== "expired",
    );

    if (replaced) {
      continue;
    }

    alerts.push({
      expiresOn: order.expiresOn,
      kind: "renew",
      orderId: order.id,
      patientId: order.patientId,
      remaining: orderUsage.remaining,
      state: orderUsage.state,
      uncoveredScheduled: orderUsage.uncoveredScheduled,
    });
  }

  const seenPatients = new Set<string>();
  const upcoming = appointments
    .filter(
      (appointment) =>
        isOrderRelevantAppointment(appointment) &&
        PROJECTED_STATUSES.has(appointment.status) &&
        appointment.date >= today &&
        daysBetween(today, appointment.date) <= horizonDays,
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  for (const appointment of upcoming) {
    const info = byAppointment.get(appointment.id);

    if (!info || info.kind === "covered" || seenPatients.has(appointment.patientId)) {
      continue;
    }

    // Si ya hay aviso de renovar para esa orden, no se repite como "sin orden".
    if (
      info.kind === "exceeded" &&
      alerts.some((alert) => alert.kind === "renew" && alert.orderId === info.orderId)
    ) {
      seenPatients.add(appointment.patientId);
      continue;
    }

    seenPatients.add(appointment.patientId);
    alerts.push({
      appointmentId: appointment.id,
      date: appointment.date,
      kind: "no_order",
      patientId: appointment.patientId,
      scheduledAt: appointment.scheduledAt,
    });
  }

  return alerts;
}

/**
 * Cuántos de los turnos nuevos de una serie entran en las órdenes del
 * paciente (después de los turnos que ya tiene). Para avisar al darlos.
 */
export function countSeriesCoverage(
  orders: readonly MedicalOrderInput[],
  appointments: readonly OrderAppointmentInput[],
  newAppointments: readonly OrderAppointmentInput[],
  today: string,
) {
  const { byAppointment } = allocateMedicalOrders(
    orders,
    [...appointments, ...newAppointments],
    today,
  );
  const covered = newAppointments.filter(
    (appointment) => byAppointment.get(appointment.id)?.kind === "covered",
  ).length;

  return { covered, uncovered: newAppointments.length - covered };
}

export function getOrderStateLabel(state: MedicalOrderState, remaining: number) {
  switch (state) {
    case "complete":
      return "Completa";
    case "expired":
      return "Vencida";
    case "low":
      return remaining === 1 ? "Queda 1 sesión" : `Quedan ${remaining} sesiones`;
    case "expiring":
      return "Vence pronto";
    default:
      return remaining === 1 ? "Queda 1 sesión" : `Quedan ${remaining} sesiones`;
  }
}

/** Texto corto para la tarjeta del turno en la agenda. */
export function getAppointmentOrderLabel(info: AppointmentOrderInfo | undefined) {
  if (!info) {
    return null;
  }

  if (info.kind === "covered") {
    return `Sesión ${info.sessionNumber} de ${info.authorizedSessions}`;
  }

  return info.kind === "exceeded" ? "Fuera de orden" : "Sin orden vigente";
}
