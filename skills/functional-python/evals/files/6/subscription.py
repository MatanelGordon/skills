"""Subscription renewal rules for the billing service."""
from datetime import datetime, timedelta

PLAN_DAYS = {"monthly": 30, "yearly": 365}


class Subscription:
    def __init__(self, user_id, plan, status="trial",
                 expires_at=None, cancelled_at=None, cancel_reason=None):
        self.user_id = user_id
        self.plan = plan                      # "monthly" or "yearly"
        self.status = status                  # "trial", "active" or "cancelled"
        self.expires_at = expires_at          # None while on trial
        self.cancelled_at = cancelled_at      # only set when cancelled
        self.cancel_reason = cancel_reason    # only set when cancelled


def renew(sub):
    if sub.status == "cancelled":
        raise ValueError("cannot renew a cancelled subscription")
    sub.expires_at = datetime.now() + timedelta(days=PLAN_DAYS[sub.plan])
    sub.status = "active"
    return sub
