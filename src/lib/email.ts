import type { MercadoPagoPreapproval } from "@/lib/mercadopago";

type SubscriptionEmailUser = {
  email?: string | null;
  fullName?: string | null;
};

type SubscriptionEmailPayload = {
  activatedAt?: string | null;
  canceledAt?: string | null;
  cancellationReference?: string | null;
  currentPeriodEnd?: string | null;
  provider: "mercadopago";
};

function formatDate(value?: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export async function sendSubscriptionActivatedEmail(
  user: SubscriptionEmailUser,
  subscription: SubscriptionEmailPayload & {
    providerSubscription?: MercadoPagoPreapproval;
  },
) {
  if (!user.email) {
    return { skipped: true };
  }

  const body = [
    `Hola ${user.fullName || user.email},`,
    "",
    "Tu suscripción a KineFlow - Particular fue activada correctamente.",
    "",
    "Desde ahora podes usar KineFlow para gestionar tus pacientes, turnos, sesiones, evolucion y cobros.",
    "",
    "Plan: KineFlow - Particular",
    `Fecha de activacion: ${formatDate(subscription.activatedAt) ?? "-"}`,
    "Medio de pago: Mercado Pago",
    `Proxima renovacion: ${formatDate(subscription.currentPeriodEnd) ?? "-"}`,
    "",
    "Podés gestionar tu suscripción desde tu cuenta en KineFlow.",
    "",
    "Gracias por confiar en KineFlow.",
    "",
    "KineFlow - Plataforma de gestión para kinesiólogos.",
    "Este correo fue enviado porque activaste una suscripción en KineFlow.",
    "Términos y Condiciones | Política de Privacidad | Baja de servicio | Contacto",
  ].join("\n");

  console.log("sendSubscriptionActivatedEmail prepared", {
    body,
    subject: "Tu suscripción a KineFlow ya está activa",
    to: user.email,
  });

  return { skipped: false };
}

export async function sendSubscriptionCancelledEmail(
  user: SubscriptionEmailUser,
  subscription: SubscriptionEmailPayload,
) {
  if (!user.email) {
    return { skipped: true };
  }

  console.log("sendSubscriptionCancelledEmail prepared", {
    body: [
      `Hola ${user.fullName || user.email},`,
      "",
      "Registramos la baja de tu suscripción a KineFlow - Particular.",
      `Referencia de gestion: ${subscription.cancellationReference ?? "-"}`,
      `Fecha de baja: ${formatDate(subscription.canceledAt) ?? "-"}`,
      "",
      "KineFlow - Plataforma de gestión para kinesiólogos.",
      "Términos y Condiciones | Política de Privacidad | Baja de servicio | Contacto",
    ].join("\n"),
    subject: "Confirmacion de baja de KineFlow",
    to: user.email,
  });

  return { skipped: false };
}
