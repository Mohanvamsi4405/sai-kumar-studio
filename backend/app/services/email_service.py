import logging
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import get_settings

settings = get_settings()
logger = logging.getLogger("email")


class EmailSendError(Exception):
    pass


def _strip_html(html: str) -> str:
    return re.sub("<[^<]+?>", "", html)


def send_email(to_email: str, subject: str, html_body: str, text_body: str | None = None) -> bool:
    if not settings.smtp_configured:
        logger.info("SMTP not configured — skipping email to %s (%s)", to_email, subject)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email
    msg.attach(MIMEText(text_body or _strip_html(html_body), "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_use_tls:
                server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from_email, [to_email], msg.as_string())
        return True
    except Exception as exc:
        raise EmailSendError(str(exc)) from exc


def send_otp_email(to_email: str, code: str, ttl_minutes: int) -> bool:
    subject = f"{code} is your Sai Kumar Studio login code"
    html = f"""
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto;">
      <h2 style="color:#7a1e2c;">Sai Kumar Studio</h2>
      <p>Your login code is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;">{code}</p>
      <p>This code expires in {ttl_minutes} minutes. If you didn't request this, you can ignore this email.</p>
    </div>
    """
    return send_email(to_email, subject, html)
