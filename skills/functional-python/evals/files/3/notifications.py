"""Turns a queued notification into the text handed to the delivery service."""


class Notification:
    def __init__(self, user_id):
        self.user_id = user_id


class Email(Notification):
    def __init__(self, user_id, subject, body):
        super().__init__(user_id)
        self.subject = subject
        self.body = body


class Sms(Notification):
    def __init__(self, user_id, text):
        super().__init__(user_id)
        self.text = text


class Push(Notification):
    def __init__(self, user_id, title, badge_count):
        super().__init__(user_id)
        self.title = title
        self.badge_count = badge_count


def render(notification):
    if isinstance(notification, Email):
        return f"{notification.subject}\n\n{notification.body}"
    elif isinstance(notification, Sms):
        return notification.text[:160]
    elif isinstance(notification, Push):
        return f"{notification.title} ({notification.badge_count})"
    else:
        return ""
