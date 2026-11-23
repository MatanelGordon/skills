"""Shopping cart used by the checkout service. Prices are integer cents."""


class LineItem:
    def __init__(self, sku, unit_price, quantity=1):
        self.sku = sku
        self.unit_price = unit_price
        self.quantity = quantity


class Cart:
    def __init__(self, customer_id, items=None):
        self.customer_id = customer_id
        self.items = items if items is not None else []
        self.coupon = None

    def add(self, item):
        self.items.append(item)

    def total(self):
        return sum(item.unit_price * item.quantity for item in self.items)


def apply_coupon(cart, code, percent_off):
    for item in cart.items:
        item.unit_price = round(item.unit_price * (100 - percent_off) / 100)
    cart.coupon = code
    return cart
