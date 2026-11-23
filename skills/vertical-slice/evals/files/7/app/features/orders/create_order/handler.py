"""Create an order."""
from dataclasses import dataclass
from uuid import uuid4

from app.shared import order_store
from app.shared.event_bus import publish
from app.shared.order_store import Order


@dataclass(frozen=True)
class CreateOrderCommand:
    customer_email: str
    total: float


@dataclass(frozen=True)
class OrderCreated:
    order_id: str
    customer_email: str
    total: float


def handle_create_order(cmd: CreateOrderCommand) -> Order:
    order = order_store.save(Order(id=str(uuid4()), customer_email=cmd.customer_email, total=cmd.total))
    publish(OrderCreated(order_id=order.id, customer_email=order.customer_email, total=order.total))
    return order
