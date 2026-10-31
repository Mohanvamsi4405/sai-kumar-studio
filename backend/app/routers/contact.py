import html
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import ContactMessage
from ..schemas import ContactIn, ContactOut
from ..services.email_service import EmailSendError, send_email

router = APIRouter(prefix="/api/contact", tags=["contact"])
settings = get_settings()
logger = logging.getLogger("contact")


def _notify_admin_of_contact(message_id: str, name: str, phone: str, email: str,
                              topic: str | None, subject: str, body_text: str) -> None:
    # Best-effort notification only - the enquiry is already saved before this
    # runs, so a down/unconfigured/slow SMTP server must not fail or delay the
    # request the visitor is waiting on (real Gmail SMTP round trips have been
    # observed taking several seconds - that used to happen inline, blocking
    # the visitor's "Sending..." spinner the whole time).
    # Every field here is visitor-submitted and unauthenticated - escape before
    # interpolating into the HTML email body below (the subject line right after
    # this isn't HTML, so it's passed as-is - Python's email module handles header
    # encoding/safety on its own).
    esc = html.escape
    try:
        send_email(
            settings.admin_email,
            f"New enquiry: {subject}",
            f"""
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
              <h2 style="color:#7a1e2c;">New Contact Enquiry</h2>
              <p><strong>Name:</strong> {esc(name)}</p>
              <p><strong>Phone:</strong> {esc(phone)}</p>
              <p><strong>Email:</strong> {esc(email)}</p>
              <p><strong>Topic:</strong> {esc(topic) if topic else '-'}</p>
              <p><strong>Subject:</strong> {esc(subject)}</p>
              <p><strong>Message:</strong><br>{esc(body_text)}</p>
            </div>
            """,
        )
    except EmailSendError as exc:
        logger.warning("Failed to email admin about contact message %s: %s", message_id, exc)


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
def create_contact_message(body: ContactIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    message = ContactMessage(**body.model_dump())
    db.add(message)
    db.commit()
    db.refresh(message)

    background_tasks.add_task(
        _notify_admin_of_contact,
        message.id, message.name, message.phone, message.email,
        message.topic, message.subject, message.message,
    )

    return message
