"""In-memory order storage."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Order:
    id: str
    customer_email: str
    total: float


_orders: dict[str, Order] = {}


def save(order: Order) -> Order:
    _orders[order.id] = order
    return order
