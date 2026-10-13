import "server-only";

import { escapeHtml, renderKineflowEmail } from "@/lib/email-templates";
import type { PublisherNotifier } from "./publisher.ts";
import { composeCaption } from "./rules.ts";
import {
  createApprovalLinks,
  getAppBaseUrl,
  signImageUrls,
  type ContentRow,
} from "./server.ts";

// Mails del publicador por Resend (mismo patrón que las invitaciones). Van
// solo a CONTENT_ADMIN_EMAIL; si falta o falta Resend, se loguea y sigue.

const FROM = () => process.env.RESEND_FROM_EMAIL || "KineFlow <notificaciones@mail.kineflow.ar>";

async function sendAdminEmail(subject: string, html: string, text: string) {
  const to = process.env.CONTENT_ADMIN_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!to || !apiKey) {
    console.warn("[content] mail no enviado: falta CONTENT_ADMIN_EMAIL o RESEND_API_KEY", { subject });
    return { sent: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({ from: FROM(), html, subject, text, to }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    console.error("[content] Resend respondió", response.status);
    return { sent: false };
  }

  return { sent: true };
}

const channelLabel = (channel: string) => (channel === "instagram" ? "Instagram" : "Facebook");

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));
}

/** Resumen con Aprobar / Rechazar por cada borrador (links de un solo uso, 72 h). */
export async function sendDraftDigest(drafts: ContentRow[], reason: "daily" | "new") {
  if (drafts.length === 0) {
    return { sent: false };
  }

  const items: string[] = [];
  const textItems: string[] = [];

  for (const draft of drafts) {
    const [links, images] = await Promise.all([
      createApprovalLinks(draft.id),
      // La imagen del mail tiene que verse aunque lo abras días después.
      signImageUrls(draft.image_paths.slice(0, 1), 7 * 24 * 60 * 60).catch(() => []),
    ]);
    const caption = composeCaption({
      caption: draft.caption,
      channel: draft.channel,
      hashtags: draft.hashtags,
      linkUrl: draft.link_url,
    });

    items.push(`
      <tr><td style="padding:0 0 28px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          ${images[0] ? `<tr><td><img src="${escapeHtml(images[0])}" alt="" width="100%" style="display:block;width:100%;max-width:520px;" /></td></tr>` : ""}
          <tr><td style="padding:16px;">
            <p style="margin:0 0 6px 0;font-size:13px;color:#6b7280;">${escapeHtml(channelLabel(draft.channel))} · ${escapeHtml(formatWhen(draft.scheduled_at))}</p>
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;color:#111827;white-space:pre-line;">${escapeHtml(caption)}</p>
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background-color:#1565FF;border-radius:8px;"><a href="${escapeHtml(links.approve)}" style="display:block;padding:12px 22px;font-size:15px;color:#ffffff;text-decoration:none;font-weight:bold;">Aprobar</a></td>
              <td style="width:12px;"></td>
              <td style="border:1px solid #d1d5db;border-radius:8px;"><a href="${escapeHtml(links.reject)}" style="display:block;padding:11px 22px;font-size:15px;color:#374151;text-decoration:none;">Rechazar</a></td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>`);
    textItems.push(
      `${channelLabel(draft.channel)} · ${formatWhen(draft.scheduled_at)}\n${caption}\nAprobar: ${links.approve}\nRechazar: ${links.reject}`,
    );
  }

  const title =
    reason === "new"
      ? `${drafts.length === 1 ? "Nuevo borrador" : `${drafts.length} borradores nuevos`} para aprobar`
      : `${drafts.length === 1 ? "1 borrador" : `${drafts.length} borradores`} esperando aprobación`;
  const html = `<div style="background-color:#f4f7fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr><td style="padding:0 0 20px 0;"><h1 style="margin:0;font-size:20px;color:#0D1B2A;">${escapeHtml(title)}</h1>
    <p style="margin:6px 0 0 0;font-size:14px;color:#4b5563;">Los botones abren una página de confirmación. Valen 72 horas y una sola vez.</p></td></tr>
    ${items.join("\n")}
    <tr><td style="font-size:13px;color:#6b7280;">También podés revisarlos en <a href="${escapeHtml(getAppBaseUrl())}/admin/contenido">/admin/contenido</a>.</td></tr>
  </table>
</div>`;

  return sendAdminEmail(`KineFlow · ${title}`, html, `${title}\n\n${textItems.join("\n\n")}`);
}

export const publisherNotifier: PublisherNotifier = {
  async failed(post, error) {
    const html = renderKineflowEmail({
      ctaLabel: "Ver en el panel",
      ctaUrl: `${getAppBaseUrl()}/admin/contenido`,
      footnote: "Se intentó 3 veces. Podés editarlo y volver a aprobarlo desde el panel.",
      icon: "⚠️",
      paragraphs: [
        `No pudimos publicar un post de **${channelLabel(post.channel)}** programado para ${formatWhen(post.scheduled_at)}.`,
        `Error: ${error}`,
      ],
      title: "Falló una publicación",
    });

    await sendAdminEmail("KineFlow · Falló una publicación", html, `Falló una publicación en ${post.channel}: ${error}`);
  },
  async tokenProblem(post, error) {
    const html = renderKineflowEmail({
      ctaLabel: "Abrir el panel",
      ctaUrl: `${getAppBaseUrl()}/admin/contenido`,
      footnote: "Los posts aprobados no se van a publicar hasta que actualices META_ACCESS_TOKEN en Vercel.",
      icon: "🔑",
      paragraphs: [
        `Meta rechazó el token al publicar en **${channelLabel(post.channel)}**: ${error}`,
        "Cómo arreglarlo: en business.facebook.com → Configuración del negocio → Usuarios del sistema, elegí el usuario del sistema de KineFlow, tocá **Generar token** con la app de KineFlow, vencimiento **Nunca** y los permisos instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement y pages_manage_posts. Revisá también que el usuario tenga asignadas la página y la cuenta de Instagram.",
        "Después reemplazá META_ACCESS_TOKEN en Vercel (Production) y volvé a aprobar el post desde el panel.",
      ],
      title: "El token de Meta no funciona",
    });

    await sendAdminEmail("KineFlow · El token de Meta no funciona", html, `El token de Meta no funciona: ${error}`);
  },
};
