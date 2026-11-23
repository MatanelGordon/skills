# THROWAWAY SPIKE - delete once the answer is written down.
#
# Question: if the volume tier discount and the loyalty discount stack, can an
# order ever sell below our 20% minimum margin?
# Prediction: no. The biggest tier is 15% and loyalty is 5%, so 20% off at most.
# Answer: (not filled in yet)

COST_SHARE = 0.66  # cost as a share of list price, pasted from the finance sheet
LIST_PRICE = 40.0

TIERS = [(0, 0.00), (50, 0.05), (200, 0.10), (1000, 0.15)]  # (minimum units, discount)
LOYALTY = 0.05


def price(units, loyal):
    discount = 0.0
    for minimum, tier_discount in TIERS:
        if units >= minimum:
            discount = tier_discount
    total = units * LIST_PRICE * (1 - discount)
    if loyal:
        total = total * (1 - LOYALTY)
    return total


for units, loyal in [(10, False), (50, True), (200, True), (1000, False), (1000, True)]:
    total = price(units, loyal)
    cost = units * LIST_PRICE * COST_SHARE
    margin = (total - cost) / total
    print(f"units={units:<5} loyal={loyal!s:<5} total={total:>9.2f} margin={margin:.1%}")
