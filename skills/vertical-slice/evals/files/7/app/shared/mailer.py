"""Outgoing email."""
import smtplib
from email.message import EmailMessage

SMTP_HOST = "localhost"
SENDER = "orders@shop.example"


def send_email(to: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = SENDER
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(SMTP_HOST) as smtp:
        smtp.send_message(message)
