"""What happens after an order is created."""
import logging

from app.features.orders.create_order.handler import OrderCreated
from app.shared.event_bus import subscribe

LARGE_ORDER_TOTAL = 10_000
logger = logging.getLogger(__name__)
sales_by_customer: dict[str, float] = {}


@subscribe(OrderCreated)
def record_sale(event: OrderCreated) -> None:
    previous = sales_by_customer.get(event.customer_email, 0.0)
    sales_by_customer[event.customer_email] = previous + event.total


@subscribe(OrderCreated)
def flag_large_order(event: OrderCreated) -> None:
    if event.total >= LARGE_ORDER_TOTAL:
        logger.warning("Large order %s: %.2f", event.order_id, event.total)
