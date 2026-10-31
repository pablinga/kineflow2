"""Envío del reporte por mail (SMTP de la biblioteca estándar).

Se activa definiendo RADAR_EMAIL_TO. Sirve cualquier SMTP: Gmail con contraseña de aplicación,
Resend (smtp.resend.com, usuario "resend", contraseña = API key), el de tu hosting, etc.
"""
import os
import smtplib
import sys
from email.message import EmailMessage


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


def build_message(settings, subject, body, attachments=()):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings["from"]
    msg["To"] = ", ".join(settings["to"])
    msg.set_content(body)
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
