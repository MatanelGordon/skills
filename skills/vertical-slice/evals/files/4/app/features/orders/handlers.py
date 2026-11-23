"""Order commands, queries and their handlers."""
from dataclasses import dataclass
from uuid import uuid4

from app.shared import order_store
from app.shared.mediator import handles
from app.shared.order_store import Order


@dataclass(frozen=True)
class CreateOrderCommand:
    customer_id: str
    total: float


@handles(CreateOrderCommand)
def handle_create_order(cmd: CreateOrderCommand) -> Order:
    order = Order(id=str(uuid4()), customer_id=cmd.customer_id, total=cmd.total, status="created")
    return order_store.save(order)


@dataclass(frozen=True)
class GetOrderQuery:
    order_id: str


@handles(GetOrderQuery)
def handle_get_order(query: GetOrderQuery) -> Order | None:
    return order_store.get(query.order_id)
