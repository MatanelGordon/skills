import unittest

from src.outline import parse_outline


class ParseOutlineTest(unittest.TestCase):
    def test_returns_headings_in_document_order(self):
        text = "# Guide\nintro\n## Install\n## Use\n"
        self.assertEqual(parse_outline(text), [(1, "Guide"), (2, "Install"), (2, "Use")])

    def test_document_without_headings_has_empty_outline(self):
        self.assertEqual(parse_outline("just a paragraph\n"), [])

    def test_ignores_byte_order_mark(self):
        self.assertEqual(parse_outline("﻿# Guide\n"), [(1, "Guide")])


if __name__ == "__main__":
    unittest.main()
