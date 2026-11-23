import unittest

from src.shipping import shipping_fee


class ShippingFeeTest(unittest.TestCase):
    def test_light_order_pays_the_base_fee(self):
        self.assertEqual(shipping_fee(2500, 1), 490)

    def test_each_extra_kg_adds_to_the_fee(self):
        self.assertEqual(shipping_fee(2500, 3), 790)

    def test_large_order_ships_free(self):
        self.assertEqual(shipping_fee(25000, 3), 0)


if __name__ == "__main__":
    unittest.main()
