# Postgres is the only store for order data

Status: accepted

Orders, their lines and their status history live in one Postgres database and
nowhere else. We looked at keeping a read copy in Redis for the order page and
turned it down: two stores disagreed during the 2024 pilot often enough that
support could not trust either.
