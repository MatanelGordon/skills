"""Create an order."""
from dataclasses import dataclass
from uuid import uuid4

from app.shared import order_store
from app.shared.order_store import Order


@dataclass(frozen=True)
class CreateOrderCommand:
    customer_email: str
    total: float


def handle_create_order(cmd: CreateOrderCommand) -> Order:
    order = Order(id=str(uuid4()), customer_email=cmd.customer_email, total=cmd.total)
    return order_store.save(order)
