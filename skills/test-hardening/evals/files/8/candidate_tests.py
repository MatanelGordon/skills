import time
import unittest
from unittest import mock

from src.reset_link import is_reset_link_valid


class Candidates(unittest.TestCase):
    def test_link_works_at_exactly_30_minutes(self):
        self.assertTrue(is_reset_link_valid(issued_at=1_000, now=2_800))

    def test_link_is_dead_one_second_after_30_minutes(self):
        self.assertFalse(is_reset_link_valid(issued_at=1_000, now=2_801))

    def test_link_works_five_minutes_after_issue(self):
        self.assertTrue(is_reset_link_valid(issued_at=1_000, now=1_300))

    def test_age_helper_is_called_once(self):
        with mock.patch("src.reset_link._age_seconds", return_value=60) as age:
            is_reset_link_valid(issued_at=1_000, now=1_060)
        age.assert_called_once_with(1_000, 1_060)

    def test_link_expires_in_real_time(self):
        with mock.patch("src.reset_link.RESET_LINK_TTL_SECONDS", 1):
            issued_at = time.time()
            time.sleep(2)
            self.assertFalse(is_reset_link_valid(issued_at, time.time()))
