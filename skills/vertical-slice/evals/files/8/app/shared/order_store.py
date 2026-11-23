"""In-memory order storage."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Order:
    id: str
    customer_id: str
    total: float
    status: str  # "created", "shipped" or "cancelled"


_orders: dict[str, Order] = {}


def get(order_id: str) -> Order | None:
    return _orders.get(order_id)


def save(order: Order) -> Order:
    _orders[order.id] = order
    return order
