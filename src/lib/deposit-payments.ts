import "server-only";

import { confirmStoredAppointment } from "@/lib/appointment-notifications";
import { formatAppointmentDateTime } from "@/lib/appointment-confirmation-rules";
import { notifyProfessional, sendDepositPaidEmail } from "@/lib/deposit-emails";
import {
  type DepositSettings,
  type DepositStatus,
  computeDepositAmount,
  depositExpiresAt,
  depositOutcomeForPaymentStatus,
} from "@/lib/deposits";
import { formatMonto } from "@/lib/format";
import {
  MercadoPagoApiError,
  createMercadoPagoDepositPreference,
  getMercadoPagoPaymentWithToken,
  refundMercadoPagoPayment,
} from "@/lib/mercadopago";
import {
  type SellerCredentials,
  getSellerCredentials,
  getSellerCredentialsByMpUserId,
  markConnectionUnauthorized,
} from "@/lib/mp-connections";
import { DEFAULT_SESSION_PRICE } from "@/lib/session-defaults";
import { getSiteUrl } from "@/lib/site-url";
import type { getSupabaseAdminClient } from "@/lib/supabase-server";

// Señas de la reserva online: cobro con Checkout Pro a nombre del profesional,
// procesamiento del pago (webhook y páginas de retorno, idempotente),
// vencimientos y reembolsos. Los montos y reglas están en lib/deposits.ts.

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

const DEPOSIT_APPOINTMENT_COLUMNS =
  "id, owner_id, workspace_id, patient_id, clinic_professional_id, scheduled_at, status, deposit_status, deposit_amount, deposit_mp_payment_id, deposit_expires_at";

export type DepositAppointmentRow = {
  clinic_professional_id: string | null;
  deposit_amount: number | string | null;
  deposit_expires_at: string | null;
  deposit_mp_payment_id: string | null;
  deposit_status: DepositStatus | null;
  id: string;
  owner_id: string;
  patient_id: string;
  scheduled_at: string;
  status: string;
  workspace_id: string;
};

/** Minutos de gracia después del vencimiento antes de liberar el horario. */
const EXPIRATION_GRACE_MS = 2 * 60 * 1000;

export async function loadDepositSettings(admin: SupabaseAdminClient, workspaceId: string) {
  const { data } = await admin
    .from("deposit_settings")
    .select(
      "deposit_enabled, deposit_type, deposit_value, payment_window_minutes, cancellation_window_hours",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return data
    ? ({ ...(data as DepositSettings), deposit_value: Number(data.deposit_value) } as DepositSettings)
    : null;
}

/**
 * Aviso al profesional de que una reserva entró sin seña. Como mucho uno por
 * día (claim atómico sobre last_fallback_notice_at).
 */
export async function notifyDepositFallback(
  admin: SupabaseAdminClient,
  workspaceId: string,
  professionalId: string,
) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("deposit_settings")
    .update({ last_fallback_notice_at: now.toISOString() })
    .eq("workspace_id", workspaceId)
    .or(`last_fallback_notice_at.is.null,last_fallback_notice_at.lt.${cutoff}`)
    .select("workspace_id");

  if ((data ?? []).length > 0) {
    await notifyProfessional(admin, professionalId, "deposit_fallback");
  }
}

async function withSellerToken<T>(
  admin: SupabaseAdminClient,
  seller: SellerCredentials,
  call: (accessToken: string) => Promise<T>,
) {
  try {
    return await call(seller.accessToken);
  } catch (error) {
    if (error instanceof MercadoPagoApiError && error.status === 401) {
      await markConnectionUnauthorized(admin, seller.connectionId);
    }

    throw error;
  }
}

/**
 * Crea el cobro de Checkout Pro de un turno en awaiting_payment. null si
 * Mercado Pago falla: quien llama pasa el turno a reserva sin seña.
 */
export async function createDepositCheckout(params: {
  admin: SupabaseAdminClient;
  amount: number;
  appointmentId: string;
  expiresAt: string;
  patientEmail: string | null;
  patientName: string;
  professionalName: string;
  seller: SellerCredentials;
  workspaceId: string;
}) {
  const site = getSiteUrl();

  try {
    const preference = await withSellerToken(params.admin, params.seller, (accessToken) =>
      createMercadoPagoDepositPreference(accessToken, {
        amount: params.amount,
        appointmentId: params.appointmentId,
        backUrl: `${site}/reservar/${params.workspaceId}/pago?turno=${params.appointmentId}`,
        expiresAt: params.expiresAt,
        notificationUrl: `${site}/api/mercadopago/webhook`,
        payerEmail: params.patientEmail,
        payerName: params.patientName,
        title: `Seña turno con ${params.professionalName}`.slice(0, 120),
      }),
    );
    const checkoutUrl = preference.init_point ?? preference.sandbox_init_point;

    if (!checkoutUrl) {
      return null;
    }

    await params.admin
      .from("appointments")
      .update({ deposit_preference_id: preference.id })
      .eq("id", params.appointmentId);

    return { checkoutUrl };
  } catch (error) {
    console.error("[deposits] preference failed", {
      appointmentId: params.appointmentId,
      status: error instanceof MercadoPagoApiError ? error.status : null,
    });
    return null;
  }
}

/** Pasa un turno en awaiting_payment a reserva común (sin seña). */
export async function convertToBookingWithoutDeposit(
  admin: SupabaseAdminClient,
  appointmentId: string,
) {
  await admin
    .from("appointments")
    .update({
      deposit_amount: null,
      deposit_expires_at: null,
      deposit_preference_id: null,
      deposit_status: null,
      status: "pending",
    })
    .eq("id", appointmentId)
    .eq("status", "awaiting_payment");
}

export type DepositProcessResult =
  | { appointmentId: string; outcome: "paid" | "rejected" | "refunded" | "wait" | "late_refund" | "duplicate" }
  | { outcome: "ignored"; reason: string };

async function loadAppointment(admin: SupabaseAdminClient, appointmentId: string) {
  const { data } = await admin
    .from("appointments")
    .select(DEPOSIT_APPOINTMENT_COLUMNS)
    .eq("id", appointmentId)
    .maybeSingle();

  return data as DepositAppointmentRow | null;
}

/**
 * Procesa un pago de seña (webhook o vuelta del checkout). Idempotente: cada
 * cambio de estado es un update condicional sobre el estado anterior, así un
 * aviso duplicado o simultáneo no cambia nada dos veces.
 *
 * Se identifica al profesional por el user_id de la notificación (webhook) o
 * por el dueño del turno (vuelta del checkout), y el pago se lee siempre de la
 * API con su token: nunca se confía en los datos que trae el aviso.
 */
export async function processDepositPayment(params: {
  admin: SupabaseAdminClient;
  /** Turno esperado (vuelta del checkout). */
  appointmentId?: string;
  /** user_id de Mercado Pago del vendedor (webhook). */
  mpUserId?: string;
  paymentId: string;
}): Promise<DepositProcessResult> {
  const { admin } = params;
  let seller: (SellerCredentials & { professionalId: string }) | null = null;

  if (params.mpUserId) {
    seller = await getSellerCredentialsByMpUserId(admin, params.mpUserId);
  } else if (params.appointmentId) {
    const expected = await loadAppointment(admin, params.appointmentId);
    const credentials = expected ? await getSellerCredentials(admin, expected.owner_id) : null;
    seller = credentials && expected ? { ...credentials, professionalId: expected.owner_id } : null;
  }

  if (!seller) {
    return { outcome: "ignored", reason: "seller_not_connected" };
  }

  const payment = await withSellerToken(admin, seller, (accessToken) =>
    getMercadoPagoPaymentWithToken(accessToken, params.paymentId),
  );
  const appointmentId = payment.external_reference ?? "";
  const appointment = /^[0-9a-f-]{36}$/i.test(appointmentId)
    ? await loadAppointment(admin, appointmentId)
    : null;

  if (!appointment || (params.appointmentId && params.appointmentId !== appointment.id)) {
    return { outcome: "ignored", reason: "appointment_not_found" };
  }

  // El pago tiene que ser del profesional dueño del turno y por el monto pedido.
  if (appointment.owner_id !== seller.professionalId) {
    console.warn("[deposits] payment from another seller", { appointmentId, paymentId: params.paymentId });
    return { outcome: "ignored", reason: "seller_mismatch" };
  }

  const expectedAmount = Number(appointment.deposit_amount) || 0;

  if (
    (payment.currency_id && payment.currency_id !== "ARS") ||
    (typeof payment.transaction_amount === "number" && payment.transaction_amount + 0.009 < expectedAmount)
  ) {
    console.warn("[deposits] amount mismatch", { appointmentId, paymentId: params.paymentId });
    return { outcome: "ignored", reason: "amount_mismatch" };
  }

  const paymentId = String(payment.id);
  const outcome = depositOutcomeForPaymentStatus(payment.status);
  const now = new Date().toISOString();

  if (outcome === "paid") {
    const { data: confirmed } = await admin
      .from("appointments")
      .update({
        deposit_mp_payment_id: paymentId,
        deposit_paid_at: payment.date_approved ?? now,
        deposit_status: "paid",
        status: "pending",
      })
      .eq("id", appointment.id)
      .eq("status", "awaiting_payment")
      .eq("deposit_status", "awaiting")
      .select("id");

    if ((confirmed ?? []).length > 0) {
      await afterDepositPaid(admin, appointment, expectedAmount);
      return { appointmentId: appointment.id, outcome: "paid" };
    }

    const current = await loadAppointment(admin, appointment.id);

    if (current?.deposit_mp_payment_id === paymentId) {
      return { appointmentId: appointment.id, outcome: "duplicate" };
    }

    // Pago aprobado de un turno que ya se liberó (venció o se rechazó antes):
    // el horario puede estar ocupado, así que se devuelve la plata.
    if (current && (current.status === "cancelled" || current.deposit_status === "expired")) {
      await refundLatePayment(admin, seller, current, paymentId);
      return { appointmentId: appointment.id, outcome: "late_refund" };
    }

    return { appointmentId: appointment.id, outcome: "duplicate" };
  }

  if (outcome === "rejected") {
    // Rechazado: se libera el horario (el paciente puede volver a reservar).
    await admin
      .from("appointments")
      .update({
        cancelled_at: now,
        cancelled_by: "system",
        deposit_mp_payment_id: paymentId,
        deposit_status: "rejected",
        status: "cancelled",
      })
      .eq("id", appointment.id)
      .eq("status", "awaiting_payment")
      .eq("deposit_status", "awaiting");
    return { appointmentId: appointment.id, outcome: "rejected" };
  }

  if (outcome === "refunded") {
    // Devolución hecha desde Mercado Pago (o contracargo): se refleja.
    await admin
      .from("appointments")
      .update({ deposit_refunded_at: now, deposit_status: "refunded" })
      .eq("id", appointment.id)
      .eq("deposit_mp_payment_id", paymentId)
      .in("deposit_status", ["paid", "retained", "refund_failed"]);
    return { appointmentId: appointment.id, outcome: "refunded" };
  }

  return { appointmentId: appointment.id, outcome: "wait" };
}

async function afterDepositPaid(
  admin: SupabaseAdminClient,
  appointment: DepositAppointmentRow,
  amount: number,
) {
  // WhatsApp: mismas reglas que un turno cargado por el profesional.
  await confirmStoredAppointment({ admin, appointment }).catch((error) => {
    console.error("[deposits] whatsapp confirmation failed", error instanceof Error ? error.message : error);
  });

  const [{ data: patient }, { data: professional }] = await Promise.all([
    admin.from("patients").select("full_name, email").eq("id", appointment.patient_id).maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", appointment.owner_id).maybeSingle(),
  ]);
  const { date, time } = formatAppointmentDateTime(appointment.scheduled_at);

  await sendDepositPaidEmail({
    amountText: formatMonto(amount),
    dateText: date,
    patientEmail: (patient as { email?: string | null } | null)?.email ?? null,
    patientName: (patient as { full_name?: string } | null)?.full_name ?? "",
    professionalName: (professional as { full_name?: string } | null)?.full_name ?? "tu kinesiólogo",
    timeText: time,
  });
}

async function refundLatePayment(
  admin: SupabaseAdminClient,
  seller: SellerCredentials,
  appointment: DepositAppointmentRow,
  paymentId: string,
) {
  try {
    const refund = await withSellerToken(admin, seller, (accessToken) =>
      refundMercadoPagoPayment(accessToken, paymentId),
    );
    await admin
      .from("appointments")
      .update({
        deposit_mp_payment_id: paymentId,
        deposit_refund_id: String(refund.id),
        deposit_refunded_at: new Date().toISOString(),
        deposit_status: "refunded",
      })
      .eq("id", appointment.id);
  } catch {
    await admin
      .from("appointments")
      .update({ deposit_mp_payment_id: paymentId, deposit_status: "refund_failed" })
      .eq("id", appointment.id);
    await notifyProfessional(admin, appointment.owner_id, "refund_failed");
  }
}

/**
 * Reembolso de la seña de un turno (cancelación). Devuelve el nuevo estado de
 * la seña: refunded, o refund_failed (con aviso al profesional).
 */
export async function refundDeposit(
  admin: SupabaseAdminClient,
  appointment: Pick<DepositAppointmentRow, "deposit_mp_payment_id" | "id" | "owner_id">,
): Promise<"refunded" | "refund_failed"> {
  const seller = appointment.deposit_mp_payment_id
    ? await getSellerCredentials(admin, appointment.owner_id)
    : null;

  if (seller && appointment.deposit_mp_payment_id) {
    try {
      const refund = await withSellerToken(admin, seller, (accessToken) =>
        refundMercadoPagoPayment(accessToken, appointment.deposit_mp_payment_id as string),
      );
      await admin
        .from("appointments")
        .update({
          deposit_refund_id: String(refund.id),
          deposit_refunded_at: new Date().toISOString(),
          deposit_status: "refunded",
        })
        .eq("id", appointment.id);
      return "refunded";
    } catch (error) {
      console.error("[deposits] refund failed", {
        appointmentId: appointment.id,
        status: error instanceof MercadoPagoApiError ? error.status : null,
      });
    }
  }

  await admin.from("appointments").update({ deposit_status: "refund_failed" }).eq("id", appointment.id);
  await notifyProfessional(admin, appointment.owner_id, "refund_failed");
  return "refund_failed";
}

/** Cron: libera los turnos con seña sin pagar cuyo plazo venció. */
export async function expireAwaitingDeposits(admin: SupabaseAdminClient, now = Date.now()) {
  const cutoff = new Date(now - EXPIRATION_GRACE_MS).toISOString();
  const { data, error } = await admin
    .from("appointments")
    .update({
      cancelled_at: new Date(now).toISOString(),
      cancelled_by: "system",
      deposit_status: "expired",
      status: "cancelled",
    })
    .eq("status", "awaiting_payment")
    .eq("deposit_status", "awaiting")
    .lt("deposit_expires_at", cutoff)
    .select("id");

  if (error) {
    throw new Error("No pudimos liberar los turnos vencidos.");
  }

  return (data ?? []).length;
}

/** Estado público de una reserva con seña (páginas de retorno del checkout). */
export async function getDepositBookingStatus(
  admin: SupabaseAdminClient,
  workspaceId: string,
  appointmentId: string,
) {
  const { data } = await admin
    .from("appointments")
    .select(`${DEPOSIT_APPOINTMENT_COLUMNS}, duration_minutes`)
    .eq("id", appointmentId)
    .eq("workspace_id", workspaceId)
    .not("deposit_status", "is", null)
    .maybeSingle();
  const appointment = data as (DepositAppointmentRow & { duration_minutes: number }) | null;

  if (!appointment) {
    return null;
  }

  const { data: professional } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", appointment.owner_id)
    .maybeSingle();
  const { date, time } = formatAppointmentDateTime(appointment.scheduled_at);

  return {
    amount: Number(appointment.deposit_amount) || 0,
    date,
    depositStatus: appointment.deposit_status,
    durationMinutes: appointment.duration_minutes,
    expiresAt: appointment.deposit_expires_at,
    professionalName: (professional as { full_name?: string } | null)?.full_name ?? "",
    time,
  };
}

/**
 * ¿La reserva lleva seña? Solo kinesiólogos particulares con la seña activa
 * y Mercado Pago conectado. Si la seña está activa pero Mercado Pago no
 * sirve, la reserva sigue sin seña y se avisa al profesional.
 */
export async function planBookingDeposit(params: {
  admin: SupabaseAdminClient;
  origin: "independent" | "clinic";
  ownerId: string;
  paymentType: "PARTICULAR" | "OBRA_SOCIAL" | "ART";
  sessionAmount: number;
  workspaceId: string;
  workspaceType: string;
}) {
  if (params.origin !== "independent" || params.workspaceType !== "PERSONAL") {
    return null;
  }

  const settings = await loadDepositSettings(params.admin, params.workspaceId);
  const amount = computeDepositAmount({
    paymentType: params.paymentType,
    sessionAmount: params.sessionAmount,
    settings,
  });

  if (!settings || amount === null) {
    return null;
  }

  const seller = await getSellerCredentials(params.admin, params.ownerId);

  if (!seller) {
    await notifyDepositFallback(params.admin, params.workspaceId, params.ownerId);
    return null;
  }

  return { amount, expiresAt: depositExpiresAt(settings), seller };
}

/**
 * Seña que va a pedir la reserva online (para avisarle al paciente antes de
 * reservar). null si el espacio no cobra seña o no tiene Mercado Pago activo.
 */
export async function getPublicDepositInfo(
  admin: SupabaseAdminClient,
  workspace: { default_session_price: number | string | null; id: string; owner_id: string | null; type: string },
) {
  if (workspace.type !== "PERSONAL" || !workspace.owner_id) {
    return null;
  }

  const [settings, { data: connection }] = await Promise.all([
    loadDepositSettings(admin, workspace.id),
    admin
      .from("mp_connections")
      .select("id")
      .eq("professional_id", workspace.owner_id)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  const amount = computeDepositAmount({
    paymentType: "PARTICULAR",
    sessionAmount: Number(workspace.default_session_price ?? DEFAULT_SESSION_PRICE),
    settings,
  });

  if (!settings || amount === null || !connection) {
    return null;
  }

  return {
    amount,
    cancellationWindowHours: settings.cancellation_window_hours,
    paymentWindowMinutes: settings.payment_window_minutes,
  };
}
