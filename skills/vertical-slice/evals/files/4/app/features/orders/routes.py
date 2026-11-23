"""HTTP routes for orders."""
from fastapi import APIRouter, HTTPException

from app.features.orders.handlers import CreateOrderCommand, GetOrderQuery
from app.shared.mediator import send

router = APIRouter(prefix="/orders")


@router.post("", status_code=201)
def create_order(body: dict):
    return send(CreateOrderCommand(customer_id=body["customer_id"], total=body["total"]))


@router.get("/{order_id}")
def get_order(order_id: str):
    order = send(GetOrderQuery(order_id=order_id))
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
