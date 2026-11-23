"""Shipping fee for one order. All amounts are in cents."""

__all__ = ["OverweightError", "shipping_fee"]

FREE_SHIPPING_FROM = 10000
MAX_WEIGHT_KG = 20
BASE_FEE = 490
FEE_PER_EXTRA_KG = 150


class OverweightError(ValueError):
    """The order is heavier than the courier accepts."""


def shipping_fee(subtotal, weight_kg):
    """Return the fee: free from 100.00, otherwise 4.90 plus 1.50 per kg above the first."""
    if weight_kg > MAX_WEIGHT_KG:
        raise OverweightError(f"{weight_kg} kg is over the {MAX_WEIGHT_KG} kg limit")
    if subtotal >= FREE_SHIPPING_FROM:
        return 0
    if weight_kg <= 1:
        return BASE_FEE
    return BASE_FEE + FEE_PER_EXTRA_KG * (weight_kg - 1)


def _debug_dump(subtotal, weight_kg):
    """One line for the support console. Not part of the public API."""
    fee = shipping_fee(subtotal, weight_kg)
    return f"subtotal={subtotal!r} weight_kg={weight_kg!r} fee={fee!r}"
