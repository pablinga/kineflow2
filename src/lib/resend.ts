// Envío de mails por Resend (mismo remitente que las invitaciones). Sin
// RESEND_API_KEY se loguea y sigue: un mail que no sale nunca corta el flujo.

export function getResendFrom() {
  return process.env.RESEND_FROM_EMAIL || "KineFlow <notificaciones@mail.kineflow.ar>";
}

export async function sendResendEmail(params: {
  html: string;
  /** Etiqueta para los logs (sin datos personales). */
  logTag: string;
  subject: string;
  text: string;
  to: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.warn(`[${params.logTag}] mail no enviado: falta RESEND_API_KEY`, {
      subject: params.subject,
    });
    return { sent: false };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: getResendFrom(),
        html: params.html,
        subject: params.subject,
        text: params.text,
        to: params.to,
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      console.error(`[${params.logTag}] Resend respondió`, response.status);
      return { sent: false };
    }

    return { sent: true };
  } catch (error) {
    console.error(`[${params.logTag}] Resend falló`, error instanceof Error ? error.message : error);
    return { sent: false };
  }
}
