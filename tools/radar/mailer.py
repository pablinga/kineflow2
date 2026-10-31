"""Envío del reporte por mail (SMTP de la biblioteca estándar).

Se activa definiendo RADAR_EMAIL_TO. Sirve cualquier SMTP: Gmail con contraseña de aplicación,
Resend (smtp.resend.com, usuario "resend", contraseña = API key), el de tu hosting, etc.
"""
import html
import os
import re
import smtplib
import sys
from email.message import EmailMessage

FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
INK, INK2, MUTED, LINE, ACCENT = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#2a78d6"


def email_settings(env=None):
    """Devuelve la configuración o None si el mail no está activado. Corta si está a medias."""
    env = os.environ if env is None else env
    to = [x.strip() for x in env.get("RADAR_EMAIL_TO", "").split(",") if x.strip()]
    if not to:
        return None
    missing = [k for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD") if not env.get(k)]
    if missing:
        sys.exit(f"RADAR_EMAIL_TO está definido pero faltan {', '.join(missing)} para mandar el mail. Ver README.md.")
    return {"to": to, "host": env["SMTP_HOST"], "port": int(env.get("SMTP_PORT") or 587),
            "user": env["SMTP_USER"], "password": env["SMTP_PASSWORD"],
            "from": env.get("RADAR_EMAIL_FROM") or env["SMTP_USER"]}


def _inline(text):
    """Escapa el texto (viene de internet) y recién después aplica negritas y links."""
    t = html.escape(text, quote=True)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return re.sub(r"(https://[^\s<]+)",
                  rf'<a href="\1" style="color:{ACCENT};text-decoration:none;white-space:nowrap">ver&nbsp;&rarr;</a>', t)


def report_html(md):
    """HTML para mail del reporte (que arma radar.build_report: #, ##, >, - y párrafos)."""
    out, in_list = [], False

    def close_list():
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    for line in md.splitlines():
        line = line.rstrip()
        if line.startswith("- "):
            if not in_list:
                out.append(f'<ul style="margin:6px 0 0;padding-left:18px;color:{INK}">')
                in_list = True
            out.append(f'<li style="margin:4px 0;line-height:1.45">{_inline(line[2:])}</li>')
            continue
        close_list()
        if not line:
            continue
        if line.startswith("## "):
            title, _, meta = line[3:].partition(" — ")
            out.append(f'<h2 style="margin:22px 0 0;padding-top:14px;border-top:1px solid {LINE};'
                       f'font-size:16px;color:{INK}">{_inline(title)}</h2>')
            if meta:
                out.append(f'<p style="margin:2px 0 0;font-size:13px;color:{INK2}">{_inline(meta)}</p>')
        elif line.startswith("# "):
            out.append(f'<h1 style="margin:0 0 4px;font-size:22px;color:{INK}">{_inline(line[2:])}</h1>')
        elif line.startswith("> "):
            out.append(f'<p style="margin:14px 0;padding:10px 14px;background:#f4f3ef;border-radius:8px;'
                       f'color:{INK2};font-size:14px;line-height:1.45">{_inline(line[2:])}</p>')
        else:
            out.append(f'<p style="margin:6px 0;color:{INK2};font-size:14px">{_inline(line)}</p>')
    close_list()
    return (f'<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#f9f9f7">'
            f'<div style="max-width:640px;margin:0 auto;padding:24px 18px;font-family:{FONT};font-size:14px">'
            f'{"".join(out)}'
            f'<p style="margin:24px 0 0;font-size:12px;color:{MUTED}">Adjunto va dashboard.html con los gráficos: '
            f'abrilo con el navegador.</p></div></body></html>')


def build_message(settings, subject, body, attachments=()):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings["from"]
    msg["To"] = ", ".join(settings["to"])
    msg.set_content(body)
    msg.add_alternative(report_html(body), subtype="html")
    for path in attachments:
        with open(path, "rb") as f:
            msg.add_attachment(f.read(), maintype="text", subtype="html" if path.endswith(".html") else "markdown",
                               filename=os.path.basename(path))
    return msg


def send(settings, msg, smtp_factory=None):
    """Manda el mail. Un error se informa pero no corta la corrida (el reporte ya quedó guardado)."""
    port = settings["port"]
    factory = smtp_factory or (smtplib.SMTP_SSL if port == 465 else smtplib.SMTP)
    try:
        with factory(settings["host"], port, timeout=30) as s:
            if port != 465 and smtp_factory is None:
                s.starttls()
            s.login(settings["user"], settings["password"])
            s.send_message(msg)
        print(f"Mail enviado a {', '.join(settings['to'])}")
        return True
    except (OSError, smtplib.SMTPException) as e:
        print(f"[warn] no se pudo mandar el mail: {e}", file=sys.stderr)
        return False
