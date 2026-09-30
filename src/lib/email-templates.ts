/**
 * Mails transaccionales de la app (invitaciones), con el mismo diseño que el
 * mail de confirmación de cuenta configurado en Supabase Auth.
 *
 * Todo texto que venga de usuarios (nombre de la clínica, etc.) se escapa.
 */

const LOGO_URL = "https://kineflow.ar/logo.png";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type KineflowEmailParams = {
  ctaLabel: string;
  ctaUrl: string;
  /** Líneas de la caja gris (emoji + texto plano). */
  highlights?: { icon: string; text: string }[];
  highlightsTitle?: string;
  icon: string;
  /** Párrafos de texto plano; `**texto**` se muestra en negrita. */
  paragraphs: string[];
  /** Nota final (ej. "Si no esperabas..."). */
  footnote: string;
  title: string;
};

function renderParagraph(text: string) {
  const html = escapeHtml(text).replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="color:#111827;">$1</strong>',
  );

  return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">${html}</p>`;
}

export function renderKineflowEmail(params: KineflowEmailParams) {
  const url = escapeHtml(params.ctaUrl);
  const highlights = params.highlights?.length
    ? `
              <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 16px;">
                    ${
                      params.highlightsTitle
                        ? `<p style="margin:0 0 10px 0;font-size:13px;font-weight:500;color:#111827;">${escapeHtml(params.highlightsTitle)}</p>`
                        : ""
                    }
                    <table cellpadding="0" cellspacing="0">
                      ${params.highlights
                        .map(
                          (item) =>
                            `<tr><td style="padding:3px 0;font-size:13px;color:#6b7280;">${item.icon}&nbsp;&nbsp;${escapeHtml(item.text)}</td></tr>`,
                        )
                        .join("\n                      ")}
                    </table>
                  </td>
                </tr>
              </table>`
    : "";

  return `<div style="margin:0;padding:0;background-color:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background-color:#2563eb;padding:28px;text-align:center;">
              <img src="${LOGO_URL}" alt="KineFlow" width="52" height="52" style="border-radius:12px;display:block;margin:0 auto 10px auto;" />
              <div style="font-size:22px;font-weight:500;color:#ffffff;letter-spacing:-0.3px;">KineFlow</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;">Gestión simple para kinesiólogos</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 24px 28px;">
              <table cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
                <tr>
                  <td style="background-color:#eff6ff;border-radius:50%;width:36px;height:36px;text-align:center;vertical-align:middle;padding:0 10px;">
                    <span style="font-size:18px;">${params.icon}</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <h1 style="margin:0;font-size:20px;font-weight:500;color:#111827;">${escapeHtml(params.title)}</h1>
                  </td>
                </tr>
              </table>

              ${params.paragraphs.map(renderParagraph).join("\n              ")}

              <table cellpadding="0" cellspacing="0" style="margin:24px 0;width:100%;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#2563eb;">
                    <a href="${url}" style="display:block;padding:13px 24px;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;border-radius:8px;text-align:center;">
                      ${escapeHtml(params.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
${highlights}
              <p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#6b7280;">Si el botón no funciona, copiá este enlace en tu navegador:</p>
              <p style="margin:0 0 20px 0;font-size:12px;line-height:1.5;word-break:break-all;color:#2563eb;">
                <a href="${url}" style="color:#2563eb;text-decoration:underline;">${url}</a>
              </p>

              <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">${escapeHtml(params.footnote)}</p>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Equipo KineFlow · Este mensaje fue enviado automáticamente</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}
