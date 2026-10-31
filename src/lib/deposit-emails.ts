import "server-only";

import { renderKineflowEmail } from "@/lib/email-templates";
import { getSiteUrl } from "@/lib/site-url";
import { sendResendEmail } from "@/lib/resend";
import type { getSupabaseAdminClient } from "@/lib/supabase-server";

// Mails de las señas: avisos al profesional (conexión con Mercado Pago,
// reservas que salieron sin seña) y confirmación al paciente cuando paga.

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type ProfessionalNotice =
  | "mp_disconnected"
  | "mp_refresh_failed"
  | "deposit_fallback"
  | "refund_failed";

const professionalNotices: Record<
  ProfessionalNotice,
  { paragraphs: string[]; subject: string; title: string }
> = {
  deposit_fallback: {
    paragraphs: [
      "Recibiste una reserva online pero **no pudimos cobrar la seña** con tu cuenta de Mercado Pago, así que el turno quedó reservado sin seña.",
      "Revisá la conexión con Mercado Pago en Configuración. Mientras no se resuelva, las reservas siguen entrando sin seña.",
    ],
    subject: "Una reserva entró sin seña",
    title: "Reserva sin seña",
  },
  mp_disconnected: {
    paragraphs: [
      "Tu cuenta de Mercado Pago **se desvinculó de KineFlow** (por ejemplo, porque quitaste el permiso desde Mercado Pago).",
      "Mientras no la vuelvas a conectar, las reservas online entran sin seña.",
    ],
    subject: "Tu cuenta de Mercado Pago se desconectó",
    title: "Mercado Pago desconectado",
  },
  mp_refresh_failed: {
    paragraphs: [
      "No pudimos renovar el permiso de tu cuenta de Mercado Pago. Si no se renueva, **las reservas online van a entrar sin seña**.",
      "Volvé a conectar Mercado Pago desde Configuración para evitarlo.",
    ],
    subject: "Revisá tu conexión con Mercado Pago",
    title: "Mercado Pago necesita atención",
  },
  refund_failed: {
    paragraphs: [
      "Se canceló un turno con seña y **no pudimos hacer el reembolso** automáticamente con tu cuenta de Mercado Pago.",
      "Revisá la conexión en Configuración o devolvé la seña desde tu cuenta de Mercado Pago.",
    ],
    subject: "No pudimos reembolsar una seña",
    title: "Reembolso pendiente",
  },
};

export async function notifyProfessional(
  admin: SupabaseAdminClient,
  professionalId: string,
  notice: ProfessionalNotice,
) {
  const { data } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", professionalId)
    .maybeSingle();
  const profile = data as { email: string | null; full_name: string | null } | null;

  if (!profile?.email) {
    return { sent: false };
  }

  const content = professionalNotices[notice];
  const ctaUrl = `${getSiteUrl()}/dashboard/configuracion#senas`;
  const greeting = `Hola ${profile.full_name?.trim() || ""},`.replace(" ,", ",");
  const html = renderKineflowEmail({
    ctaLabel: "Ir a Configuración",
    ctaUrl,
    footnote: "Recibís este mail porque usás señas en tus reservas online de KineFlow.",
    icon: "💳",
    paragraphs: [greeting, ...content.paragraphs],
    title: content.title,
  });
  const text = [greeting, "", ...content.paragraphs.map((line) => line.replace(/\*\*/g, "")), "", ctaUrl].join(
    "\n",
  );

  return sendResendEmail({
    html,
    logTag: `deposits:${notice}`,
    subject: content.subject,
    text,
    to: profile.email,
  });
}

export async function sendDepositPaidEmail(params: {
  amountText: string;
  dateText: string;
  patientEmail: string | null;
  patientName: string;
  professionalName: string;
  timeText: string;
}) {
  if (!params.patientEmail) {
    return { sent: false };
  }

  const paragraphs = [
    `Hola ${params.patientName},`,
    `Recibimos tu seña de **${params.amountText}**. Tu turno con ${params.professionalName} quedó confirmado.`,
  ];
  const html = renderKineflowEmail({
    ctaLabel: "Ver KineFlow",
    ctaUrl: getSiteUrl(),
    footnote:
      "Si necesitás cancelar o cambiar el turno, comunicate con el profesional. La devolución de la seña depende de su política de cancelación.",
    highlights: [
      { icon: "📅", text: params.dateText },
      { icon: "🕒", text: params.timeText },
      { icon: "👤", text: params.professionalName },
    ],
    highlightsTitle: "Tu turno",
    icon: "✅",
    paragraphs,
    title: "Turno confirmado",
  });

  return sendResendEmail({
    html,
    logTag: "deposits:paid",
    subject: "Tu turno quedó confirmado",
    text: [
      ...paragraphs.map((line) => line.replace(/\*\*/g, "")),
      `${params.dateText} ${params.timeText}`,
    ].join("\n"),
    to: params.patientEmail,
  });
}

